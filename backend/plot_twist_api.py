"""Supabase-backed room transport. Uses existing rooms, encrypted at rest with a server-only key.
Compare-and-swap prevents lost turns even if another process receives a concurrent request.
WebSockets carry invalidations only; all private state requires a bearer session over HTTP.

Avatars: 20 numbered picture slots, uploaded at /admin/plot-twist-avatars (admin password).
Each upload is centre-cropped to a square, saved as a 256 px WebP in its own reserved `rooms`
row (code ptavatar:<id>) and listed in the `plot_twist_avatars` row (slot -> id). Picture
urls never change (a new upload gets a new id), so phones cache them for good.
"""
import asyncio
import base64
import hashlib
import io
import json
import os
import secrets
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, File, Header, HTTPException, Response, UploadFile, WebSocket, WebSocketDisconnect
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
import plot_twist as engine

PREFIX = 'plot_twist_v1:'
ROOM_CODE_RE = re.compile(r'^\d{5}$')
AVATAR_INDEX = 'plot_twist_avatars'
AVATAR_ROW = 'ptavatar:'
AVATAR_ID_RE = re.compile(r'^[0-9a-f]{20}$')
AVATAR_SIDE = 256
AVATAR_MIN_SIDE = 64
AVATAR_MAX_BYTES = 15 * 1024 * 1024


def avatar_webp(data):
    """An uploaded picture as a square 256 px WebP (centre crop, phone rotation applied, transparency kept)."""
    if not data:
        raise ValueError('That file is empty.')
    if len(data) > AVATAR_MAX_BYTES:
        raise ValueError('That picture is over 15 MB.')
    Image.MAX_IMAGE_PIXELS = 60_000_000
    try:
        img = Image.open(io.BytesIO(data))
        fmt = img.format
        img.load()
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise ValueError('That file is not a picture we can read. Use JPG, PNG or WebP.') from None
    if fmt not in ('JPEG', 'PNG', 'WEBP'):
        raise ValueError(f'Use a JPG, PNG or WebP picture (this one is {fmt or "unknown"}).')
    img = ImageOps.exif_transpose(img)
    if min(img.size) < AVATAR_MIN_SIDE:
        raise ValueError(f'That picture is too small ({img.size[0]}x{img.size[1]}). Use at least {AVATAR_MIN_SIDE}x{AVATAR_MIN_SIDE}.')
    alpha = img.mode in ('RGBA', 'LA', 'PA') or (img.mode == 'P' and 'transparency' in img.info)
    img = ImageOps.fit(img.convert('RGBA' if alpha else 'RGB'), (AVATAR_SIDE, AVATAR_SIDE), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, 'WEBP', quality=86, method=6)
    return out.getvalue()


def _deny_admin():
    raise HTTPException(401, 'Unauthorized')

class Create(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)
    mode: Literal['story','trap'] = 'story'
    rounds: int = Field(default=3, ge=0, le=10)
    dev: bool = False
    lang: Literal['en','ar'] = 'en'
class Join(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)
class Action(BaseModel):
    action: Literal['start','replay','submit','add_test','end','reroll','style']
    text: str = Field(default='', max_length=350)
    turn: int = 0
    run: str = ''
    request_id: str = Field(default='', max_length=80)
    as_player: str = ''
    # Word Trap rerolls: the assignment and swap count the player is looking at.
    secret: str = Field(default='', max_length=80)
    used: int = Field(default=-1, ge=-1, le=10)
    word: str = Field(default='', max_length=40)
    # Ink and highlight a player picks for their own lines.
    ink: str = Field(default='', max_length=20)
    mark: str = Field(default='', max_length=20)


def say(g, en, ar):
    return ar if engine.lang_of(g) == 'ar' else en


def router(db, query, require_admin=None):
    api = APIRouter(prefix='/api/plot-twist')
    locks = defaultdict(asyncio.Lock)
    sockets = defaultdict(set)
    admin = Depends(require_admin or _deny_admin)

    def cipher():
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        if not key: raise HTTPException(503, 'Room storage is not configured.')
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('plot-twist:'+key).encode()).digest()))

    def pack(g):
        return [PREFIX + cipher().encrypt(json.dumps(g).encode()).decode()]

    async def load(code):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'Room code must contain exactly five digits.')
        result = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', code).maybe_single().execute())
        flags = result.data.get('flags') if result and result.data else None
        if not flags or not isinstance(flags[0], str) or not flags[0].startswith(PREFIX):
            raise HTTPException(404, 'Rooftop not found. Check the room code. · ما لقينا هالغرفة. تأكد من الكود.')
        try: return json.loads(cipher().decrypt(flags[0][len(PREFIX):].encode())), result.data['wheel_winner_choice_id']
        except InvalidToken: raise HTTPException(503, 'Room cannot be decrypted with the current server key.')

    def auth(g, authorization):
        try:
            scheme, credential = (authorization or '').split(' ', 1)
            pid, token = credential.split(':', 1)
            if scheme.lower() != 'bearer': raise ValueError()
            return engine.authenticate(g, pid, token)
        except (ValueError, engine.GameError):
            raise HTTPException(403, say(g, 'Your session could not be verified. Rejoin on your original device.', 'ما قدرنا نتأكد منك. ارجع من نفس الجهاز اللي دخلت منه.'))

    def viewer(g, p, as_player):
        if not as_player or as_player == p['id']: return p['id']
        if not g['dev'] or p['id'] != g['host']:
            raise HTTPException(403, 'Only a developer-room host may control test players.')
        if not any(x['id'] == as_player and x['simulated'] for x in g['players']):
            raise HTTPException(403, 'Only simulated players can be controlled here.')
        return as_player

    async def save(code, g, old):
        flags = pack(g)
        result = await query(lambda: db().table('rooms').update({'flags':flags,'wheel_winner_choice_id':secrets.token_hex(16)}).eq('code',code).eq('wheel_winner_choice_id',old).execute())
        if not result.data: raise HTTPException(409, say(g, 'Room changed. Please try again.', 'الغرفة تغيرت. جرب مرة ثانية.'))
        await asyncio.gather(*(notify(ws) for ws in list(sockets[code])))

    async def notify(ws):
        try: await asyncio.wait_for(ws.send_json({'type':'refresh'}), timeout=1)
        except Exception: pass

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try: g, p = engine.new_game(body.nickname, body.mode, body.rounds, body.dev, body.lang)
        except engine.GameError as e: raise HTTPException(400, e.text(body.lang))
        for _ in range(50):
            code = f'{secrets.randbelow(100000):05d}'
            existing = await query(lambda: db().table('rooms').select('code').eq('code',code).maybe_single().execute())
            if existing and existing.data: continue
            try:
                await query(lambda: db().table('rooms').insert({'code':code,'flags':pack(g),'wheel_winner_choice_id':secrets.token_hex(16),'created_at':datetime.now(timezone.utc).isoformat()}).execute())
            except Exception as exc:
                if 'duplicate' in str(exc).lower() or '23505' in str(exc):
                    continue
                raise
            return dict(code=code, player_id=p['id'], token=p['token'], state=engine.view(g,p['id']))
        raise HTTPException(503, 'Could not reserve a room. Try again.')

    @api.post('/rooms/{code}/join')
    async def join(code: str, body: Join, response: Response):
        if not ROOM_CODE_RE.fullmatch(code): raise HTTPException(400, 'Room code must contain exactly five digits.')
        response.headers['Cache-Control'] = 'no-store'
        async with locks[code]:
            g, old = await load(code)
            try: p = engine.add_player(g, body.nickname)
            except engine.GameError as e: raise HTTPException(400, e.text(engine.lang_of(g)))
            await save(code,g,old)
            return dict(code=code, player_id=p['id'], token=p['token'], state=engine.view(g,p['id']))

    @api.get('/rooms/{code}')
    async def state(code: str, response: Response, as_player: str = '', authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        g, _ = await load(code)
        p = auth(g,authorization)
        return engine.view(g,viewer(g,p,as_player))

    @api.post('/rooms/{code}/action')
    async def action(code: str, body: Action, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            p = auth(g,authorization)
            pid = viewer(g,p,body.as_player)
            try:
                if body.action == 'submit': engine.submit(g,pid,body.text,body.turn,body.run,body.request_id)
                elif body.action == 'reroll':
                    if body.run != g['run']: raise engine.GameError('The story changed. Your word has been refreshed.','السالفة تغيرت. حدّثنا لك كلمتك.')
                    engine.reroll(g,pid,body.secret,body.used,body.request_id,body.word)
                elif body.action == 'style': engine.set_style(g,pid,body.ink,body.mark)
                else:
                    if p['id'] != g['host']: raise HTTPException(403,say(g,'Only the host can do that.','بس المضيف يقدر يسوي هالشي.'))
                    if body.action == 'end':
                        engine.end(g)
                    elif body.action == 'add_test':
                        if not g['dev']: raise HTTPException(403,'This is not a developer room.')
                        engine.add_player(g,f"Guest {len(g['players']) + 1}",True)
                    elif body.action == 'replay':
                        if g['status'] != 'ended': raise engine.GameError('Finish this story first.','خلصوا السالفة أول.')
                        engine.start(g)
                    else:
                        if g['status'] != 'lobby': raise engine.GameError('The story has already started.','السالفة بدت خلاص.')
                        engine.start(g)
            except engine.GameError as e: raise HTTPException(400,e.text(engine.lang_of(g)))
            await save(code,g,old)
            return engine.view(g,pid)

    # ------------------------------------------------------------------ avatars

    async def avatar_slots():
        """({'1': id, ...}, version) from the index row; (empty, None) before the first upload."""
        res = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', AVATAR_INDEX).maybe_single().execute())
        data = res.data if res and res.data else None
        if not data:
            return {}, None
        flags = data.get('flags')
        slots = flags[0] if isinstance(flags, list) and flags and isinstance(flags[0], dict) else {}
        slots = {k: v for k, v in slots.items() if k.isdigit() and 1 <= int(k) <= engine.AVATARS and isinstance(v, str) and AVATAR_ID_RE.fullmatch(v)}
        return slots, data.get('wheel_winner_choice_id') or ''

    async def save_avatar_slots(slots, version):
        row = {'flags': [slots], 'wheel_winner_choice_id': secrets.token_hex(16)}
        if version is None:
            await query(lambda: db().table('rooms').insert({'code': AVATAR_INDEX, 'created_at': datetime.now(timezone.utc).isoformat(), **row}).execute())
            return
        result = await query(lambda: db().table('rooms').update(row).eq('code', AVATAR_INDEX).eq('wheel_winner_choice_id', version).execute())
        if not result or not result.data:
            raise HTTPException(409, 'The avatars just changed somewhere else. Reload and try again.')

    async def drop_unused_picture(aid, slots):
        if aid and aid not in slots.values():
            try: await query(lambda: db().table('rooms').delete().eq('code', AVATAR_ROW + aid).execute())
            except Exception: pass  # an orphaned picture costs a few KB; the slot is already right

    def avatar_list(slots):
        return dict(count=engine.AVATARS, slots=[slots.get(str(n)) for n in range(1, engine.AVATARS + 1)])

    @api.get('/avatars')
    async def avatars(response: Response):
        response.headers['Cache-Control'] = 'no-cache'
        slots, _ = await avatar_slots()
        return avatar_list(slots)

    @api.get('/avatars/{aid}.webp')
    async def avatar_picture(aid: str):
        if not AVATAR_ID_RE.fullmatch(aid):
            raise HTTPException(404, 'Avatar not found.')
        res = await query(lambda: db().table('rooms').select('flags').eq('code', AVATAR_ROW + aid).maybe_single().execute())
        flags = res.data.get('flags') if res and res.data else None
        try: data = base64.b64decode(flags[0]['b64'])
        except Exception: raise HTTPException(404, 'Avatar not found.')
        return Response(data, media_type='image/webp', headers={'Cache-Control': 'public, max-age=31536000, immutable'})

    def avatar_slot(slot):
        if not 1 <= slot <= engine.AVATARS:
            raise HTTPException(404, f'Avatar slots are numbered 1 to {engine.AVATARS}.')
        return str(slot)

    @api.put('/avatars/{slot}')
    async def upload_avatar(slot: int, file: UploadFile = File(...), _: bool = admin):
        n = avatar_slot(slot)
        try: picture = avatar_webp(await file.read(AVATAR_MAX_BYTES + 1))
        except ValueError as e: raise HTTPException(400, str(e))
        aid = hashlib.sha256(picture).hexdigest()[:20]
        row = [dict(mime='image/webp', b64=base64.b64encode(picture).decode())]
        async with locks[AVATAR_INDEX]:
            existing = await query(lambda: db().table('rooms').select('code').eq('code', AVATAR_ROW + aid).maybe_single().execute())
            if not (existing and existing.data):
                await query(lambda: db().table('rooms').insert({'code': AVATAR_ROW + aid, 'flags': row, 'created_at': datetime.now(timezone.utc).isoformat()}).execute())
            slots, version = await avatar_slots()
            old = slots.get(n)
            slots[n] = aid
            await save_avatar_slots(slots, version)
            if old != aid: await drop_unused_picture(old, slots)
        return avatar_list(slots)

    @api.delete('/avatars/{slot}')
    async def clear_avatar(slot: int, _: bool = admin):
        n = avatar_slot(slot)
        async with locks[AVATAR_INDEX]:
            slots, version = await avatar_slots()
            old = slots.pop(n, None)
            if old:
                await save_avatar_slots(slots, version)
                await drop_unused_picture(old, slots)
        return avatar_list(slots)

    @api.websocket('/rooms/{code}/live')
    async def live(ws: WebSocket, code: str):
        await ws.accept()
        try:
            credentials = await asyncio.wait_for(ws.receive_json(),10)
            g, _ = await load(code)
            auth(g,credentials.get('authorization',''))
            sockets[code].add(ws)
            await ws.send_json({'type':'refresh'})
            while True:
                await asyncio.wait_for(ws.receive_text(),60)
                await ws.send_json({'type':'pong'})
        except (WebSocketDisconnect, asyncio.TimeoutError, HTTPException, ValueError, TypeError): pass
        finally:
            sockets[code].discard(ws)
            try: await ws.close()
            except Exception: pass
    return api
