"""Clock Race studio API: /api/admin/clock-race/* (admin only) and /api/clock-race/asset/* (public pictures).

The whole studio state is one JSON document in a reserved row of the existing `rooms` table
(code CONTENT_CODE), guarded by an optimistic version token so two tabs can't overwrite each other.
See clock_race_content.py for the review / publish rules.
"""
from __future__ import annotations

import asyncio
import copy
import io
import json
import logging
import random
import re
import secrets
import time
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

import clock_race_admin_auth as auth
import clock_race_assets as A
import clock_race_content as C
import clock_race_iq as Q

log = logging.getLogger(__name__)

CONTENT_CODE = 'clock_race_content'
REFRESH_SECONDS = 15
MAX_FILES = 20

_state_lock = asyncio.Lock()
_limiter = auth.Limiter()
_refresh = {'at': 0.0, 'busy': None}
_db = {'db': None, 'query': None}


class Login(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class Save(BaseModel):
    data: Dict[str, Any]
    base: Optional[str] = Field(default=None, max_length=40)   # updated_at the editor started from


class Create(BaseModel):
    type: Literal['tile', 'photo', 'price', 'belong', 'older', 'compare', 'which', 'animal', 'vote', 'wrongword', 'iq']
    data: Dict[str, Any] = Field(default_factory=dict)


class Status(BaseModel):
    status: Literal['draft', 'approved', 'rejected']


class IqMake(BaseModel):
    kind: Literal['fold', 'hidden', 'matrix', 'rotate', 'match', 'overlap']


class Bulk(BaseModel):
    ids: List[str] = Field(min_length=1, max_length=500)


class Publish(BaseModel):
    rev: int = Field(ge=0)   # the rev the admin saw in the summary; refused if someone published since


class Credit(BaseModel):
    source: str = Field(default='', max_length=300)
    license: str = Field(default='', max_length=300)
    author: str = Field(default='', max_length=300)
    note: str = Field(default='', max_length=300)


class TileRender(BaseModel):
    source: Optional[str] = Field(default=None, max_length=60)   # asset:<id>; None keeps the current one
    crop: Optional[Dict[str, Any]] = None
    grid: Optional[int] = Field(default=None, ge=2, le=3)
    regenerate: bool = False
    opts: Optional[List[List[Any]]] = None


# ------------------------------------------------------------------ state document


async def load_state():
    """(state, version token). A missing row is an empty state (all built-ins live as before)."""
    db, query = _db['db'], _db['query']
    res = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', CONTENT_CODE).maybe_single().execute())
    data = res.data if res and res.data else None
    if not data:
        return C.empty_state(), None
    flags = data.get('flags')
    state = flags[0] if isinstance(flags, list) and flags and isinstance(flags[0], dict) else C.empty_state()
    for k, v in C.empty_state().items():
        state.setdefault(k, v)
    return state, data.get('wheel_winner_choice_id') or ''


async def save_state(state, version):
    db, query = _db['db'], _db['query']
    new_version = secrets.token_hex(16)
    row = {'flags': [state], 'wheel_winner_choice_id': new_version}
    if version is None:
        try:
            await query(lambda: db().table('rooms').insert({'code': CONTENT_CODE, 'created_at': C.now_iso(), **row}).execute())
        except HTTPException:
            raise HTTPException(409, 'Someone else just saved. Reload and try again.')
        return new_version
    res = await query(lambda: db().table('rooms').update(row).eq('code', CONTENT_CODE).eq('wheel_winner_choice_id', version).execute())
    if not res or not res.data:
        raise HTTPException(409, 'Someone else just saved. Reload and try again.')
    return new_version


async def mutate(fn):
    """Load, change, save, under a lock; retried once on a version clash. Refreshes the live pool."""
    async with _state_lock:
        for attempt in range(2):
            state, version = await load_state()
            try:
                result = fn(state)
                if asyncio.iscoroutine(result):
                    result = await result
            except (ValueError, KeyError) as exc:
                raise HTTPException(400, str(exc).strip("'")) from None
            try:
                await save_state(state, version)
            except HTTPException as exc:
                if exc.status_code == 409 and attempt == 0:
                    continue
                raise
            C.LIVE.load(state)
            _refresh['at'] = time.time()
            return state, result


async def refresh_live(force=False):
    """Keep the game's live pool in step with the published state (cheap; called before each round)."""
    if _db['db'] is None:
        return
    if not force and time.time() - _refresh['at'] < REFRESH_SECONDS:
        return
    if _refresh['busy']:
        await _refresh['busy']
        return
    fut = asyncio.get_event_loop().create_future()
    _refresh['busy'] = fut
    try:
        state, _ = await load_state()
        C.LIVE.load(state)
        _refresh['at'] = time.time()
    except Exception as exc:  # the game keeps the last good pool
        log.warning('Clock Race studio: could not refresh live content: %s', exc)
        _refresh['at'] = time.time() - REFRESH_SECONDS + 3
    finally:
        _refresh['busy'] = None
        fut.set_result(None)


# ------------------------------------------------------------------ helpers


def _who(authorization: str) -> str:
    token = (authorization or '').removeprefix('Bearer ').strip()
    try:
        return auth.verify(token)
    except auth.AuthError as exc:
        raise HTTPException(exc.status, exc.msg) from None


def _address(request: Request):
    fwd = request.headers.get('x-forwarded-for', '')
    return (fwd.split(',')[0].strip() or (request.client.host if request.client else '')) or 'unknown'


def _item_payload(state, qid):
    e = C.view(state, qid)
    if not e:
        raise HTTPException(404, 'No such question.')
    assets = state.get('assets', {})
    e['problems'] = C.validate(e['type'], e['draft'], assets)
    e['refs'] = _refs(e, assets)
    return e


def _refs(e, assets):
    """asset:<id> -> {url, thumb, credit, w, h} for every picture the item points at (any version)."""
    out = {}
    blob = json.dumps([e.get('draft'), e.get('approved'), e.get('published'), e.get('live_data')])
    for aid in set(re.findall(r'asset:([a-f0-9]{8,40})', blob)):
        a = assets.get(aid)
        if a:
            out['asset:' + aid] = {k: a.get(k) for k in ('url', 'thumb', 'original', 'credit', 'w', 'h', 'name')}
    return out


def _counts(rows):
    c = dict(total=len(rows), draft=0, approved=0, rejected=0, needs_review=0, missing_images=0, errors=0,
             live=0, legacy=0, unpublished=0)
    for r in rows:
        c[r['status']] += 1
        c['needs_review'] += r['status'] == 'draft'
        c['missing_images'] += bool(r['missing_image'])
        c['errors'] += r['errors'] > 0
        c['live'] += r['live'] == 'live'
        c['legacy'] += r['live'] == 'legacy'
        c['unpublished'] += bool(r['dirty'])
    return c


async def _piece_for_check(d, state):
    """The corner piece as a PIL image (for the symmetric-piece check), when we can get it."""
    from PIL import Image
    if d.get('pic'):
        path = C.PUBLIC / 'tiles' / f'{d["pic"]}-piece.webp'
        if path.exists():
            return Image.open(path).convert('RGB')
    return None


# ------------------------------------------------------------------ router


def router(db, query):
    _db['db'], _db['query'] = db, query
    store = A.Store(db, query)
    api = APIRouter(prefix='/api/admin/clock-race')
    public = APIRouter(prefix='/api/clock-race')

    @api.post('/login')
    async def login(body: Login, request: Request):
        try:
            name, token = auth.login(body.password, _address(request), _limiter)
        except auth.AuthError as exc:
            raise HTTPException(exc.status, exc.msg) from None
        return dict(token=token, name=name, hours=auth.TOKEN_HOURS)

    @api.get('/me')
    async def me(authorization: str = Header(default='')):
        return dict(name=_who(authorization))

    @api.get('/library')
    async def library(authorization: str = Header(default='')):
        _who(authorization)
        state, _ = await load_state()
        C.LIVE.load(state)
        rows = C.summary(state)
        return dict(items=rows, counts=_counts(rows), types=C.TYPE_LABELS, generated=C.GENERATED_TYPES,
                    min_live=C.MIN_LIVE, live_counts=C.live_counts(state), pending=C.pending(state), rev=state.get('rev', 0),
                    publishes=[{k: p.get(k) for k in ('rev', 'at', 'by', 'kind', 'of', 'reverted_by_rev', 'changes')}
                               for p in reversed(state.get('publishes', [])[-15:])],
                    assets={'asset:' + aid: dict(thumb=a.get('thumb'), url=a.get('url')) for aid, a in state.get('assets', {}).items()},
                    art_check=C.ART_KEYS is not None)

    @api.get('/items/{qid}')
    async def item(qid: str, authorization: str = Header(default='')):
        _who(authorization)
        state, _ = await load_state()
        return _item_payload(state, qid)

    @api.put('/items/{qid}')
    async def save(qid: str, body: Save, authorization: str = Header(default='')):
        who = _who(authorization)

        def change(state):
            cur = state['items'].get(qid)
            if body.base is not None and cur and (cur.get('updated_at') or '') != body.base:
                raise ValueError(f'{cur.get("updated_by") or "Someone"} changed this question since you opened it. Reload it first.')
            C.save_draft(state, qid, body.data, who)
        state, _ = await mutate(change)
        return _item_payload(state, qid)

    @api.post('/items')
    async def create(body: Create, authorization: str = Header(default='')):
        who = _who(authorization)
        state, e = await mutate(lambda s: C.create(s, body.type, body.data, who))
        return _item_payload(state, e['id'])

    @api.post('/items/{qid}/status')
    async def status(qid: str, body: Status, authorization: str = Header(default='')):
        who = _who(authorization)
        state, _ = await mutate(lambda s: C.set_status(s, qid, body.status, who))
        return _item_payload(state, qid)

    @api.post('/items/{qid}/discard')
    async def discard(qid: str, authorization: str = Header(default='')):
        who = _who(authorization)
        state, _ = await mutate(lambda s: C.revert_draft(s, qid, who))
        return _item_payload(state, qid)

    @api.delete('/items/{qid}')
    async def delete(qid: str, authorization: str = Header(default='')):
        """Delete a question for good (admins only): gone from the studio and from new rounds at once."""
        who = _who(authorization)
        _, kind = await mutate(lambda s: C.delete(s, qid, who))
        return dict(id=qid, type=kind, deleted=True)

    @api.post('/items/{qid}/iq')
    async def iq_new(qid: str, body: IqMake, authorization: str = Header(default='')):
        """Make a fresh visual puzzle of a kind for this question (saved as its draft; already checked)."""
        who = _who(authorization)

        def change(state):
            e = C.view(state, qid)
            if not e or e['type'] != 'iq':
                raise KeyError('No such puzzle.')
            C.save_draft(state, qid, Q.generate(body.kind), who)
        state, _ = await mutate(change)
        return _item_payload(state, qid)

    @api.post('/bulk-approve')
    async def bulk(body: Bulk, authorization: str = Header(default='')):
        who = _who(authorization)

        def change(state):
            done, skipped = [], []
            for qid in body.ids:
                try:
                    C.set_status(state, qid, 'approved', who)
                    done.append(qid)
                except (ValueError, KeyError) as exc:
                    skipped.append(dict(id=qid, reason=str(exc).strip("'")))
            return dict(approved=done, skipped=skipped)
        _, result = await mutate(change)
        return result

    @api.get('/items/{qid}/preview')
    async def preview(qid: str, which: Literal['draft', 'live'] = 'draft', authorization: str = Header(default='')):
        _who(authorization)
        state, _ = await load_state()
        e = C.view(state, qid)
        if not e:
            raise HTTPException(404, 'No such question.')
        d = e['draft'] if which == 'draft' else e['live_data']
        if d is None:
            raise HTTPException(404, 'This question is not live.')
        task = C.preview_task(e['type'], d, state.get('assets', {}))
        if e['type'] == 'animal':
            others = [a for a in C.builtin().values() if a[0] == 'animal' and a[1]['key'] != d.get('key')]
            picks = random.sample(others, 3)
            task['options'] = [task['target']] + [[p[1]['key'], p[1]['ar'], p[1]['en']] for p in picks]
        if e['type'] in C.PICTURE_KINDS or e['type'] in ('photo', 'price', 'animal'):
            # shuffle like the game does, keeping track of the right one
            key = (lambda o: json.dumps(o, ensure_ascii=False))
            right = key(task['options'][task['answer']])
            random.shuffle(task['options'])
            task['answer'] = [key(o) for o in task['options']].index(right)
        return task

    # ---------------------------------------------------------------- jigsaw

    @api.post('/items/{qid}/tile')
    async def tile(qid: str, body: TileRender, authorization: str = Header(default='')):
        """Re-cut the puzzle from its source photo (crop / grid), regenerate the pieces, or set them."""
        who = _who(authorization)
        state, _ = await load_state()
        e = C.view(state, qid)
        if not e or e['type'] != 'tile':
            raise HTTPException(404, 'No such puzzle.')
        d = copy.deepcopy(e['draft'])
        source = body.source or d.get('source')
        if body.grid:
            d['grid'] = body.grid
        new_assets = {}
        piece_img = None
        if body.crop is not None or body.source or body.grid:
            if not source:
                raise HTTPException(400, 'Pick a source photo first.')
            m = C.ASSET_REF.match(source)
            a = state.get('assets', {}).get(m.group(1)) if m else None
            if not a:
                raise HTTPException(400, 'Source photo not found.')
            raw = await _fetch_asset(store, a)
            if raw is None:
                raise HTTPException(502, 'Could not read the source photo back from storage.')
            from PIL import Image
            src = Image.open(io.BytesIO(raw))
            # a new source photo starts from the largest centred square
            crop = body.crop or ({} if body.source and body.source != d.get('source') else d.get('crop')) or {}
            w, h = src.size
            try:
                size = int(crop.get('size', min(w, h)))
                crop = dict(x=int(crop.get('x', (w - size) // 2)), y=int(crop.get('y', (h - size) // 2)), size=size)
            except (TypeError, ValueError):
                raise HTTPException(400, 'Bad crop.') from None
            if crop['size'] < 150:
                raise HTTPException(400, 'Crop is too small; zoom out.')
            puzzle, piece, square = C.render_tile(src, crop, d.get('grid', 3))
            piece_img = piece
            for name, im in (('img', puzzle), ('piece', piece), ('full', square)):
                # asset ids are hex only: the reference pattern and the public file route both require it
                rec = await A.save_rendered(store, secrets.token_hex(10), C.webp_bytes(im, 86), who, f'tile-{name}',
                                            C.now_iso(), *im.size)
                new_assets[rec['id']] = rec
                d.setdefault('rendered', {})
                d['rendered'] = dict(d.get('rendered') or {})
                d['rendered'][name] = 'asset:' + rec['id']
            d['source'], d['crop'], d['pic'] = source, crop, None
        if piece_img is None:
            piece_img = await _piece_for_check(d, state)
        if body.opts is not None:
            d['opts'] = body.opts
        elif body.regenerate or len(d.get('opts') or []) != 4:
            d['opts'], _ = C.gen_tile_opts(piece=piece_img)
        if piece_img is not None:
            # a symmetric corner makes a mirrored decoy look right as well: flag it (blocks approval)
            opts = C.normalize('tile', d)['opts']
            sym = len(opts) == 4 and C._looks_alike(piece_img, opts)
            if d.get('rendered') or sym:
                d['rendered'] = dict(d.get('rendered') or {}, symmetric=sym)

        def change(s):
            s.setdefault('assets', {}).update(new_assets)
            C.save_draft(s, qid, d, who)
        state, _ = await mutate(change)
        return _item_payload(state, qid)

    # ---------------------------------------------------------------- pictures

    @api.post('/assets')
    async def upload(files: List[UploadFile] = File(...), source: str = Form(''), license: str = Form(''),
                     author: str = Form(''), note: str = Form(''), authorization: str = Header(default='')):
        who = _who(authorization)
        if len(files) > MAX_FILES:
            raise HTTPException(400, f'Up to {MAX_FILES} pictures at a time.')
        credit = dict(source=source, license=license, author=author, note=note)
        saved, failed = [], []
        for f in files:
            data = await f.read(A.MAX_BYTES + 1)
            try:
                saved.append(await A.save_upload(store, data, f.filename or '', who, credit, C.now_iso()))
            except A.AssetError as exc:
                failed.append(dict(name=f.filename, reason=str(exc)))
            except Exception as exc:
                log.exception('Clock Race studio upload failed')
                failed.append(dict(name=f.filename, reason=f'Could not store it ({type(exc).__name__}).'))
        if saved:
            def change(s):
                for rec in saved:
                    old = s.setdefault('assets', {}).get(rec['id'])
                    if old:  # same bytes uploaded again: keep the first record, fill in credits if missing
                        if not old.get('credit') and rec['credit']:
                            old['credit'] = rec['credit']
                    else:
                        s['assets'][rec['id']] = rec
            await mutate(change)
        return dict(saved=[dict(ref='asset:' + r['id'], **r) for r in saved], failed=failed)

    @api.get('/assets')
    async def assets(authorization: str = Header(default='')):
        _who(authorization)
        state, _ = await load_state()
        used = {}
        for qid in C.all_ids(state):
            e = state['items'].get(qid)
            if e:
                for aid in set(re.findall(r'asset:([a-f0-9]{8,40})', json.dumps([e.get('draft'), e.get('approved'), e.get('published')]))):
                    used.setdefault(aid, []).append(qid)
        rows = [dict(ref='asset:' + aid, used_by=used.get(aid, []), **a) for aid, a in state.get('assets', {}).items()]
        rows.sort(key=lambda r: r.get('uploaded_at') or '', reverse=True)
        return dict(assets=rows)

    @api.get('/assets/{aid}/usage')
    async def asset_usage(aid: str, authorization: str = Header(default='')):
        _who(authorization)
        state, _ = await load_state()
        if aid not in state.get('assets', {}):
            raise HTTPException(404, 'No such picture.')
        return dict(id=aid, used_by=C.asset_usage(state, aid))

    @api.delete('/assets/{aid}')
    async def asset_delete(aid: str, confirm: bool = False, authorization: str = Header(default='')):
        """Delete an uploaded picture for good (admins only). The record and every question's reference go
        first (one saved state), then its files leave storage. A picture the live game shows is refused."""
        who = _who(authorization)
        if not re.fullmatch(r'[a-f0-9]{8,40}', aid):
            raise HTTPException(404, 'No such picture.')
        _, (record, cleared) = await mutate(lambda s: C.delete_asset(s, aid, who, confirm))
        problems = await store.remove(A.asset_paths(aid, record))
        if problems:
            log.warning('Clock Race studio: picture %s deleted, but some files stayed: %s', aid, problems)
        return dict(id=aid, deleted=True, cleared=cleared, files_left=bool(problems))

    @api.patch('/assets/{aid}')
    async def credit(aid: str, body: Credit, authorization: str = Header(default='')):
        _who(authorization)

        def change(s):
            a = s.get('assets', {}).get(aid)
            if not a:
                raise KeyError('No such picture.')
            a['credit'] = A.clean_credit(body.model_dump())
            return a
        _, a = await mutate(change)
        return a

    # ---------------------------------------------------------------- publishing

    @api.get('/pending')
    async def pending(authorization: str = Header(default='')):
        _who(authorization)
        state, _ = await load_state()
        return dict(rev=state.get('rev', 0), changes=C.pending(state), live_counts=C.live_counts(state))

    @api.post('/publish')
    async def publish(body: Publish, authorization: str = Header(default='')):
        who = _who(authorization)

        def change(s):
            if s.get('rev', 0) != body.rev:
                raise ValueError('Someone published in the meantime. Review the summary again.')
            return C.publish(s, who)
        state, rec = await mutate(change)
        return dict(rev=rec['rev'], changes=rec['changes'], at=rec['at'], by=rec['by'])

    @api.post('/publish/{rev}/revert')
    async def revert(rev: int, authorization: str = Header(default='')):
        who = _who(authorization)
        _, rec = await mutate(lambda s: C.revert_publish(s, rev, who))
        return dict(rev=rec['rev'], changes=rec['changes'])

    # ---------------------------------------------------------------- public pictures (database fallback)

    @public.get('/asset/{aid}/{name}')
    async def asset_file(aid: str, name: str):
        if not re.fullmatch(r'[a-f0-9]{8,40}', aid) or not re.fullmatch(r'(player|thumb)\.webp|original\.(jpg|png|webp)', name):
            raise HTTPException(404, 'Not found')
        got = await store.get_db(f'{aid}/{name}')
        if not got:
            raise HTTPException(404, 'Not found')
        data, mime = got
        return Response(content=data, media_type=mime, headers={'Cache-Control': 'public, max-age=31536000, immutable'})

    return api, public


async def _fetch_asset(store, a):
    """The best copy of a stored picture (original if kept, else the player version) as bytes."""
    import httpx
    for key in ('original', 'url'):
        url = a.get(key)
        if not url:
            continue
        if url.startswith('/api/clock-race/asset/'):
            got = await store.get_db(url.removeprefix('/api/clock-race/asset/'))
            if got:
                return got[0]
            continue
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(url)
                if r.status_code == 200:
                    return r.content
        except Exception as exc:
            log.warning('Clock Race studio: fetch %s failed: %s', url, exc)
    return None
