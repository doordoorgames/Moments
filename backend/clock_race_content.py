"""Clock Race content studio: the reviewed, persistent layer over the built-in question banks.

The built-in banks (clock_race_bank.py, clock_race_prices.json, PHOTO_BANK / landmarks, TILE_SET,
clock_race_data.QUESTIONS, ANIMALS) stay in code and stay live until someone reviews them. Every admin
change is stored in one JSON document (a reserved row of the existing `rooms` table, the same pattern
as the Emoji Rooftop clue bank), so approvals and image swaps never need a redeploy.

Per item:
    status      draft | approved | rejected   (the working state the studio edits)
    draft       the data being edited
    approved    the last approved data (kept when an approved item is edited again)
    published   what the live game serves for this item, or None = never published
    published_status   approved | rejected | None

What the live game uses for an item:
    published_status == 'approved'  -> published data
    published_status == 'rejected'  -> nothing (the item is out of new rounds)
    never published, built-in       -> the built-in data (legacy, stays playable until reviewed)
    never published, new            -> nothing

Publishing copies every approved / rejected change into `published` in one step and logs the old values,
so a publish can be reverted. Rounds already being played keep the tasks they were built with.

This module is pure Python (no FastAPI, no database) so it can be tested on its own.
"""
from __future__ import annotations

import copy
import io
import json
import random
import re
import threading
import time
from pathlib import Path

import clock_race_bank as K
import clock_race_data as D

# ------------------------------------------------------------------ types

PICTURE_KINDS = ('belong', 'older', 'compare', 'which')
EDITABLE_TYPES = ('tile', 'photo', 'price') + PICTURE_KINDS + ('animal', 'vote')

TYPE_LABELS = {
    'tile': 'Missing piece (jigsaw)', 'photo': 'Photo / landmark', 'price': 'What costs more',
    'belong': 'Odd one out (pictures)', 'older': 'Which is older', 'compare': 'Heavier / bigger',
    'which': 'Which one (facts)', 'animal': 'Find the animal', 'vote': 'Friend question',
}

# Challenges the server draws fresh every round from rules, not from a question list. Shown in the
# studio for completeness; there is nothing per-question to review.
GENERATED_TYPES = {
    'odd': 'Different face (drawn faces, generated)',
    'stroop': 'Colour or word (generated)',
    'geo': 'Geography map (fixed set of map shapes)',
    'sock': 'Lonely sock (generated)',
    'memory': 'Letter memory grid (generated)',
    'avoid': "Don't tap (generated buttons)",
    'scale': 'Heaviest group (generated)',
    'shadow': 'Shadow match (generated)',
    'alphabet': 'Which letter comes later (generated)',
    'word': 'Word Rush (dictionary checked)',
    'boss': 'Final boss (generated faces)',
}

# A round needs at least this many live items of a type (several of a type can appear in one round).
MIN_LIVE = {'belong': 6, 'older': 5, 'compare': 3, 'which': 5, 'price': 5, 'photo': 4, 'tile': 2,
            'animal': 6, 'vote': 3}

STATUSES = ('draft', 'approved', 'rejected')
FLIPS = ('none', 'H', 'V')
TURNS = (0, 90, 180, 270)
TILE_SIZE = 900          # the squared puzzle picture, like the hand-made p01-p10
HOLE_COLOR = (30, 29, 34)  # the blanked corner in the existing puzzles
ARABIC = re.compile(r'[؀-ۿ]')
ASSET_REF = re.compile(r'^asset:([a-f0-9]{8,40})$')

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parent / 'frontend' / 'public' / 'clock-race'


def _art_keys():
    """Art keys from the frontend manifest when the repo is checked out alongside (None if not)."""
    path = ROOT.parent / 'frontend' / 'src' / 'components' / 'clockRace' / 'artManifest.js'
    try:
        return set(re.findall(r'^\s*([a-z0-9_]+):\s*\'', path.read_text(encoding='utf-8'), re.M))
    except OSError:
        return None


ART_KEYS = _art_keys()

# ------------------------------------------------------------------ built-in catalogue


def _builtin_tiles():
    import clock_race as engine  # late: clock_race imports this module
    return {pic: dict(pic=pic, source=None, crop=None, grid=3, opts=[list(o) for o in opts], rendered=None)
            for pic, opts in engine.TILE_SET.items()}


def _builtin_photos():
    import clock_race as engine
    out = {}
    for q in engine.PHOTO_BANK:
        d = dict(pic=q['pic'], mode=q['mode'], ar=q['ar'], en=q['en'], options=[list(o) for o in q['options']])
        if q.get('landmark'):
            d['landmark'] = q['landmark']
        out[q['id']] = d
    return out


def _builtin_prices():
    import clock_race as engine
    return {q['id']: dict(options=copy.deepcopy(q['options'])) for q in engine.PRICE_BANK}


_BUILTIN = None
_BUILTIN_LOCK = threading.Lock()


def builtin():
    """{id: (type, data)} for every reviewable built-in question. Built once."""
    global _BUILTIN
    with _BUILTIN_LOCK:
        if _BUILTIN is None:
            b = {}
            for pic, d in _builtin_tiles().items():
                b[pic] = ('tile', d)
            for qid, d in _builtin_photos().items():
                b[qid] = ('photo', d)
            for qid, d in _builtin_prices().items():
                b[qid] = ('price', d)
            for x in K.QUESTIONS:
                b[x['id']] = (x['kind'], dict(ar=x['ar'], en=x['en'], options=[list(o) for o in x['options']],
                                              difficulty=x['difficulty'], fact=x['fact'], source=x['source']))
            for key, ar, en in K.ANIMALS:
                b['animal_' + key] = ('animal', dict(key=key, ar=ar, en=en))
            for i, (ar, en) in enumerate(D.QUESTIONS):
                b[f'v{i + 1:02d}'] = ('vote', dict(ar=ar, en=en))
            _BUILTIN = b
        return _BUILTIN


# ------------------------------------------------------------------ state document


def empty_state():
    return dict(version=1, items={}, assets={}, log=[], publishes=[], rev=0)


def now_iso():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def _entry(state, qid):
    """The stored record for an item, creating one for an untouched built-in item."""
    items = state['items']
    if qid in items:
        return items[qid]
    b = builtin().get(qid)
    if not b:
        raise KeyError(qid)
    kind, data = b
    e = dict(id=qid, type=kind, origin='builtin', status='draft', draft=copy.deepcopy(data), approved=None,
             published=None, published_status=None, history=[], created_at=None, updated_at=None,
             updated_by=None, approved_by=None, approved_at=None, published_by=None, published_at=None)
    items[qid] = e
    return e


def view(state, qid):
    """An item as the studio sees it (built-in items that were never touched included)."""
    e = state['items'].get(qid)
    if e is None:
        b = builtin().get(qid)
        if not b:
            return None
        kind, data = b
        e = dict(id=qid, type=kind, origin='builtin', status='draft', draft=copy.deepcopy(data), approved=None,
                 published=None, published_status=None, history=[], updated_at=None, updated_by=None,
                 approved_by=None, approved_at=None, published_by=None, published_at=None)
    else:
        e = copy.deepcopy(e)
    e['live'] = live_state(e)
    e['live_data'] = live_data(e)
    e['dirty'] = _unpublished_change(e) is not None
    e['label'] = TYPE_LABELS.get(e['type'], e['type'])
    return e


def all_ids(state):
    return list(dict.fromkeys(list(builtin()) + list(state['items'])))


def live_state(e):
    """'live' (published approved), 'legacy' (built-in, never reviewed), 'off'."""
    if e.get('published_status') == 'approved':
        return 'live'
    if e.get('published_status') == 'rejected':
        return 'off'
    return 'legacy' if e.get('origin') == 'builtin' else 'off'


def live_data(e):
    if e.get('published_status') == 'approved':
        return e['published']
    if e.get('published_status') is None and e.get('origin') == 'builtin':
        b = builtin().get(e['id'])
        return b[1] if b else None
    return None


def _log(e, action, who, note=None):
    rec = dict(at=now_iso(), by=who, action=action)
    if note:
        rec['note'] = note
    e.setdefault('history', []).append(rec)
    e['history'] = e['history'][-40:]


def save_draft(state, qid, data, who):
    """Edit an item. Its status goes back to draft; the approved and live copies are untouched."""
    e = _entry(state, qid)
    clean = normalize(e['type'], data)
    e['draft'] = clean
    if e['status'] != 'draft':
        e['status'] = 'draft'
    e['updated_at'], e['updated_by'] = now_iso(), who
    _log(e, 'edit', who)
    return e


def create(state, kind, data, who, qid=None):
    if kind not in EDITABLE_TYPES:
        raise ValueError(f'Unknown question type: {kind}')
    if qid is None:
        prefix = {'tile': 'tile', 'photo': 'photo', 'price': 'price', 'animal': 'animal', 'vote': 'vote'}.get(kind, kind[:1])
        qid = f'{prefix}_n{secrets_hex(4)}'
    if qid in state['items'] or qid in builtin():
        raise ValueError('That id already exists.')
    e = dict(id=qid, type=kind, origin='new', status='draft', draft=normalize(kind, data), approved=None,
             published=None, published_status=None, history=[], created_at=now_iso(), updated_at=now_iso(),
             updated_by=who, approved_by=None, approved_at=None, published_by=None, published_at=None)
    _log(e, 'create', who)
    state['items'][qid] = e
    return e


def secrets_hex(n):
    import secrets
    return secrets.token_hex(n)


def set_status(state, qid, status, who, assets=None):
    if status not in STATUSES:
        raise ValueError('Bad status')
    e = _entry(state, qid)
    if status == 'approved':
        problems = [p for p in validate(e['type'], e['draft'], assets if assets is not None else state.get('assets', {})) if p['level'] == 'error']
        if problems:
            raise ValueError('Fix before approving: ' + '; '.join(p['msg'] for p in problems[:4]))
        e['approved'] = copy.deepcopy(e['draft'])
        e['approved_by'], e['approved_at'] = who, now_iso()
    e['status'] = status
    e['updated_at'], e['updated_by'] = now_iso(), who
    _log(e, status if status != 'draft' else 'back to draft', who)
    return e


def revert_draft(state, qid, who):
    """Throw away unsaved-to-live edits: the draft goes back to the last approved (or live) version."""
    e = _entry(state, qid)
    base = e.get('approved') or live_data(e)
    if base is None:
        raise ValueError('Nothing to go back to.')
    e['draft'] = copy.deepcopy(base)
    e['status'] = 'approved' if e.get('approved') else 'draft'
    _log(e, 'discard edits', who)
    return e


def _unpublished_change(e):
    """What publishing would do to this item: ('approve', data) / ('reject', None) / None."""
    if e.get('status') == 'approved' and e.get('approved') is not None:
        if e.get('published_status') != 'approved' or e.get('published') != e['approved']:
            return ('approve', e['approved'])
    if e.get('status') == 'rejected' and e.get('published_status') != 'rejected':
        return ('reject', None)
    return None


def pending(state):
    """Changes waiting for Publish, for the confirmation summary."""
    out = []
    for qid, e in state['items'].items():
        ch = _unpublished_change(e)
        if ch:
            was = live_state(e)
            out.append(dict(id=qid, type=e['type'], change=ch[0], was=was,
                            what='new' if ch[0] == 'approve' and was == 'off' and e['origin'] == 'new' else
                            ('back live' if ch[0] == 'approve' and was == 'off' else ('updated' if ch[0] == 'approve' else 'removed'))))
    return sorted(out, key=lambda x: (x['type'], x['id']))


def live_counts(state, override=None):
    """Live items per type, optionally as if `override` {id: (status, data)} were already published."""
    counts = {k: 0 for k in EDITABLE_TYPES}
    for qid in all_ids(state):
        e = state['items'].get(qid) or view(state, qid)
        st = live_state(e)
        if override and qid in override:
            st = 'live' if override[qid][0] == 'approve' else 'off'
        if st in ('live', 'legacy'):
            counts[e['type']] += 1
    return counts


def publish(state, who, assets=None):
    """Make every approved / rejected change live at once. Returns the publish record."""
    changes = {}
    for qid, e in state['items'].items():
        ch = _unpublished_change(e)
        if ch:
            changes[qid] = ch
    if not changes:
        raise ValueError('Nothing to publish.')
    assets = assets if assets is not None else state.get('assets', {})
    for qid, (kind, data) in changes.items():
        if kind == 'approve':
            errs = [p for p in validate(state['items'][qid]['type'], data, assets) if p['level'] == 'error']
            if errs:
                raise ValueError(f'{qid}: ' + '; '.join(p['msg'] for p in errs[:3]))
    counts = live_counts(state, changes)
    short = [f'{TYPE_LABELS[k]} would have {n} (needs {MIN_LIVE[k]})' for k, n in counts.items() if n < MIN_LIVE[k]]
    if short:
        raise ValueError('Not enough live questions: ' + '; '.join(short))
    state['rev'] = state.get('rev', 0) + 1
    rec = dict(rev=state['rev'], at=now_iso(), by=who, kind='publish', changes=[], before={})
    for qid, (kind, data) in sorted(changes.items()):
        e = state['items'][qid]
        rec['before'][qid] = dict(published=copy.deepcopy(e.get('published')), published_status=e.get('published_status'))
        e['published'] = copy.deepcopy(data) if kind == 'approve' else e.get('published')
        e['published_status'] = 'approved' if kind == 'approve' else 'rejected'
        e['published_by'], e['published_at'] = who, rec['at']
        _log(e, 'published' if kind == 'approve' else 'removed from live', who, f'rev {rec["rev"]}')
        rec['changes'].append(dict(id=qid, type=e['type'], change=kind))
    state.setdefault('publishes', []).append(rec)
    state['publishes'] = state['publishes'][-30:]
    return rec


def revert_publish(state, rev, who):
    """Undo one publish: the items it changed go back to what was live before it (as a new publish)."""
    rec = next((p for p in state.get('publishes', []) if p['rev'] == rev and p.get('kind') == 'publish'), None)
    if not rec:
        raise ValueError('That publish is not in the history any more.')
    if rec.get('reverted_by_rev'):
        raise ValueError('Already reverted.')
    override = {qid: (('approve' if b['published_status'] == 'approved' or (b['published_status'] is None and state['items'][qid]['origin'] == 'builtin') else 'reject'), None)
                for qid, b in rec['before'].items()}
    counts = live_counts(state, override)
    short = [f'{TYPE_LABELS[k]} would have {n}' for k, n in counts.items() if n < MIN_LIVE[k]]
    if short:
        raise ValueError('Reverting would leave too few live questions: ' + '; '.join(short))
    state['rev'] += 1
    new = dict(rev=state['rev'], at=now_iso(), by=who, kind='revert', of=rev, changes=[], before={})
    for qid, b in rec['before'].items():
        e = state['items'][qid]
        new['before'][qid] = dict(published=copy.deepcopy(e.get('published')), published_status=e.get('published_status'))
        e['published'], e['published_status'] = copy.deepcopy(b['published']), b['published_status']
        e['published_by'], e['published_at'] = who, new['at']
        # The working copy follows, so the studio doesn't immediately offer to re-publish the change.
        if b['published_status'] == 'approved':
            e['approved'] = copy.deepcopy(b['published'])
            e['draft'], e['status'] = copy.deepcopy(b['published']), 'approved'
        elif b['published_status'] == 'rejected':
            e['status'] = 'rejected'
        else:
            e['status'] = 'draft'
            if e['origin'] == 'builtin':
                e['draft'] = copy.deepcopy(builtin()[qid][1])
                e['approved'] = None
        _log(e, 'reverted', who, f'rev {rev}')
        new['changes'].append(dict(id=qid, type=e['type'], change='revert'))
    rec['reverted_by_rev'] = new['rev']
    state['publishes'].append(new)
    state['publishes'] = state['publishes'][-30:]
    return new


# ------------------------------------------------------------------ normalising and validation


def _s(v, n=300):
    return str(v if v is not None else '').strip()[:n]


def normalize(kind, data):
    """Keep only the fields a type uses, in their expected shape (never trust the browser)."""
    if not isinstance(data, dict):
        raise ValueError('Question data must be an object.')
    if kind in PICTURE_KINDS:
        opts = [[_s(o[0], 120), _s(o[1], 80), _s(o[2], 80)] for o in data.get('options') or [] if isinstance(o, (list, tuple)) and len(o) >= 3]
        diff = data.get('difficulty') if data.get('difficulty') in ('easy', 'medium', 'hard') else 'medium'
        return dict(ar=_s(data.get('ar')), en=_s(data.get('en')), options=opts, difficulty=diff,
                    fact=_s(data.get('fact'), 500), source=_s(data.get('source'), 300))
    if kind == 'price':
        opts = []
        for o in data.get('options') or []:
            if not isinstance(o, dict):
                continue
            try:
                unit = float(o.get('unit_usd'))
            except (TypeError, ValueError):
                unit = 0
            try:
                qty = int(o.get('quantity') or 1)
            except (TypeError, ValueError):
                qty = 1
            item = dict(key=_s(o.get('key'), 60), ar=_s(o.get('ar'), 80), en=_s(o.get('en'), 80),
                        unit_usd=int(unit) if unit == int(unit) else unit, quantity=qty,
                        price_basis=_s(o.get('price_basis'), 200), source=_s(o.get('source'), 300),
                        checked=_s(o.get('checked'), 20))
            if o.get('model_year') not in (None, ''):
                try:
                    item['model_year'] = int(o.get('model_year'))
                except (TypeError, ValueError):
                    pass
            if o.get('image'):
                item['image'] = _s(o.get('image'), 60)
            opts.append(item)
        return dict(options=opts)
    if kind == 'photo':
        out = dict(pic=_s(data.get('pic'), 120), mode=data.get('mode') if data.get('mode') in ('ask', 'recall') else 'ask',
                   ar=_s(data.get('ar')), en=_s(data.get('en')),
                   options=[[_s(o[0], 80), _s(o[1], 80)] for o in data.get('options') or [] if isinstance(o, (list, tuple)) and len(o) >= 2])
        if data.get('landmark'):
            out['landmark'] = _s(data.get('landmark'), 60)
        return out
    if kind == 'tile':
        crop = data.get('crop')
        if isinstance(crop, dict):
            try:
                crop = dict(x=max(0, int(crop['x'])), y=max(0, int(crop['y'])), size=max(1, int(crop['size'])))
            except (KeyError, TypeError, ValueError):
                crop = None
        else:
            crop = None
        opts = []
        for o in data.get('opts') or []:
            if isinstance(o, (list, tuple)) and len(o) == 2 and o[0] in FLIPS:
                try:
                    deg = int(o[1]) % 360
                except (TypeError, ValueError):
                    continue
                if deg in TURNS:
                    opts.append([o[0], deg])
        rendered = data.get('rendered') if isinstance(data.get('rendered'), dict) else None
        if rendered:
            rendered = {k: _s(rendered.get(k), 60) for k in ('img', 'piece', 'full') if rendered.get(k)}
            for k in ('symmetric',):
                if k in (data.get('rendered') or {}):
                    rendered[k] = bool(data['rendered'][k])
        grid = data.get('grid') if data.get('grid') in (2, 3) else 3
        return dict(pic=_s(data.get('pic'), 20) or None, source=_s(data.get('source'), 60) or None, crop=crop,
                    grid=grid, opts=opts, rendered=rendered or None, title=_s(data.get('title'), 80))
    if kind == 'animal':
        return dict(key=_s(data.get('key'), 120), ar=_s(data.get('ar'), 60), en=_s(data.get('en'), 60))
    if kind == 'vote':
        return dict(ar=_s(data.get('ar')), en=_s(data.get('en')))
    raise ValueError(f'Unknown question type: {kind}')


def image_ok(ref, assets, folder=None):
    """Is a picture reference one we can serve? (art key, asset id, or a known photo path)"""
    if not ref:
        return False
    m = ASSET_REF.match(ref)
    if m:
        return m.group(1) in assets
    if folder:
        return (PUBLIC / folder / f'{ref}.webp').exists() if PUBLIC.exists() else True
    return ART_KEYS is None or ref in ART_KEYS


def _problem(out, level, msg):
    out.append(dict(level=level, msg=msg))


def validate(kind, d, assets=None):
    """Problems with a question: errors block approval and publishing, warnings don't."""
    assets = assets or {}
    out = []
    if kind in PICTURE_KINDS or kind == 'photo' or kind == 'vote':
        if not d.get('ar'):
            _problem(out, 'error', 'Arabic question is empty')
        elif not ARABIC.search(d['ar']):
            _problem(out, 'error', 'Arabic question has no Arabic letters')
        if not d.get('en'):
            _problem(out, 'error', 'English question is empty')
    if kind in PICTURE_KINDS:
        need = 4 if kind == 'belong' else 2
        opts = d.get('options') or []
        if len(opts) != need:
            _problem(out, 'error', f'Needs exactly {need} answers (has {len(opts)})')
        keys = [o[0] for o in opts]
        if len(set(keys)) != len(keys):
            _problem(out, 'error', 'Two answers use the same picture')
        for i, (key, ar, en) in enumerate(opts):
            tag = 'Correct answer' if i == 0 else f'Answer {i + 1}'
            if not image_ok(key, assets):
                _problem(out, 'error', f'{tag}: picture missing ({key or "none"})')
            if not ar or not ARABIC.search(ar):
                _problem(out, 'error', f'{tag}: Arabic name missing')
            if not en:
                _problem(out, 'error', f'{tag}: English name missing')
        for lang in (1, 2):
            names = [o[lang].strip().lower() for o in opts]
            if len(set(names)) != len(names):
                _problem(out, 'error', 'Two answers have the same name')
                break
        if not d.get('fact'):
            _problem(out, 'warn', 'No fact line')
        if not d.get('source'):
            _problem(out, 'warn', 'No source note')
    elif kind == 'price':
        opts = d.get('options') or []
        if not 2 <= len(opts) <= 3:
            _problem(out, 'error', f'Needs 2 or 3 items (has {len(opts)})')
        totals = []
        for i, o in enumerate(opts):
            tag = f'Item {i + 1}'
            if not o.get('key'):
                _problem(out, 'error', f'{tag}: key missing')
            if not o.get('ar') or not ARABIC.search(o['ar']):
                _problem(out, 'error', f'{tag}: Arabic name missing')
            if not o.get('en'):
                _problem(out, 'error', f'{tag}: English name missing')
            if not o.get('unit_usd') or o['unit_usd'] <= 0:
                _problem(out, 'error', f'{tag}: price must be above 0')
            if o.get('quantity', 1) < 1:
                _problem(out, 'error', f'{tag}: quantity must be 1 or more')
            img = o.get('image')
            if img and not image_ok(img, assets):
                _problem(out, 'error', f'{tag}: picture missing')
            if not img and PUBLIC.exists() and not (PUBLIC / 'art' / 'prices' / f'{o.get("key")}.webp').exists():
                _problem(out, 'error', f'{tag}: no picture for key {o.get("key")}')
            if not o.get('source'):
                _problem(out, 'warn', f'{tag}: no price source')
            totals.append((o.get('unit_usd') or 0) * (o.get('quantity') or 1))
        if len(totals) != len(set(totals)):
            _problem(out, 'error', 'Two items cost exactly the same: no single right answer')
        keys = [o.get('key') for o in opts]
        if len(set(keys)) != len(keys):
            _problem(out, 'error', 'Two items share a key')
    elif kind == 'photo':
        opts = d.get('options') or []
        if not 2 <= len(opts) <= 4:
            _problem(out, 'error', f'Needs 2 to 4 answers (has {len(opts)})')
        for i, (ar, en) in enumerate(opts):
            tag = 'Correct answer' if i == 0 else f'Answer {i + 1}'
            if not ar or not ARABIC.search(ar):
                _problem(out, 'error', f'{tag}: Arabic text missing')
            if not en:
                _problem(out, 'error', f'{tag}: English text missing')
        for lang in (0, 1):
            names = [o[lang].strip().lower() for o in opts]
            if len(set(names)) != len(names):
                _problem(out, 'error', 'Two answers are the same')
                break
        if not image_ok(d.get('pic'), assets, folder='photos'):
            _problem(out, 'error', 'Photo missing')
    elif kind == 'tile':
        out.extend(validate_tile(d, assets))
    elif kind == 'animal':
        if not image_ok(d.get('key'), assets):
            _problem(out, 'error', 'Picture missing')
        if not d.get('ar') or not ARABIC.search(d['ar']):
            _problem(out, 'error', 'Arabic name missing')
        if not d.get('en'):
            _problem(out, 'error', 'English name missing')
    return out


# ------------------------------------------------------------------ jigsaw (missing piece) rules
# An option is [flip, deg]: flip ('none', 'H' left-right, 'V' top-bottom) first, then a clockwise turn,
# exactly like the CSS in NewTasks.jsx (rotate(deg) scaleX/scaleY(-1)). Two options look the same for every
# picture when their transforms are equal: e.g. H then 90 equals V then 270.

_FLIP_M = {'none': ((1, 0), (0, 1)), 'H': ((-1, 0), (0, 1)), 'V': ((1, 0), (0, -1))}
_ROT_M = {0: ((1, 0), (0, 1)), 90: ((0, -1), (1, 0)), 180: ((-1, 0), (0, -1)), 270: ((0, 1), (-1, 0))}


def _mul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(2)) for j in range(2)) for i in range(2))


def transform_key(opt):
    flip, deg = opt
    return _mul(_ROT_M[deg % 360], _FLIP_M[flip])


def validate_tile(d, assets):
    out = []
    opts = d.get('opts') or []
    if len(opts) != 4:
        _problem(out, 'error', f'Needs exactly 4 pieces (has {len(opts)})')
    right = [o for o in opts if o[0] == 'none']
    if len(right) != 1:
        _problem(out, 'error', f'Exactly one piece must be un-mirrored (has {len(right)})')
    if len({transform_key(o) for o in opts}) != len(opts):
        _problem(out, 'error', 'Two pieces look identical (same mirror + turn); regenerate')
    mirrored = [transform_key(o) for o in opts if o[0] != 'none']
    if right and any(transform_key(right[0]) == m for m in mirrored):
        _problem(out, 'error', 'A decoy matches the correct piece')
    if d.get('rendered', {}) and d['rendered'].get('symmetric'):
        _problem(out, 'error', 'The corner piece is symmetric, so a mirrored decoy looks right too; move the crop')
    if d.get('pic'):
        if PUBLIC.exists() and not (PUBLIC / 'tiles' / f'{d["pic"]}.webp').exists():
            _problem(out, 'error', f'Puzzle picture missing ({d["pic"]})')
    else:
        r = d.get('rendered') or {}
        if not r.get('img') or not r.get('piece'):
            _problem(out, 'error', 'Puzzle not rendered yet (save the crop)')
        else:
            for k in ('img', 'piece'):
                if not image_ok(r[k], assets):
                    _problem(out, 'error', f'Rendered {k} missing')
        if not d.get('source'):
            _problem(out, 'error', 'No source photo')
    if right and right[0][1] == 0:
        _problem(out, 'warn', 'The correct piece is not turned; it is easier to spot')
    return out


def gen_tile_opts(rng=None, piece=None, tries=60):
    """Four pieces: the real one turned (never mirrored) + three mirrored-and-turned decoys, alternating
    the existing mixes (2 H + 1 V or 1 H + 2 V). All four differ as transforms and, when the piece image
    is given, also as pictures. Returns (opts, symmetric_flag)."""
    rng = rng or random.SystemRandom()
    best = None
    for _ in range(tries):
        right = ['none', rng.choice((90, 180, 270))]
        flips = rng.choice((['H', 'H', 'V'], ['H', 'V', 'V']))
        decoys = [[f, rng.choice(TURNS)] for f in flips]
        opts = [right] + decoys
        if len({transform_key(o) for o in opts}) != 4:
            continue
        if piece is not None and _looks_alike(piece, opts):
            best = best or opts
            continue
        rng.shuffle(opts)
        return opts, False
    if best is not None:
        rng.shuffle(best)
        return best, True
    raise ValueError('Could not build four different pieces')


def apply_opt(img, opt):
    from PIL import Image
    flip, deg = opt
    if flip == 'H':
        img = img.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    elif flip == 'V':
        img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    return img.rotate(-deg, expand=False) if deg else img


def _looks_alike(piece, opts, threshold=10.0):
    """True when two options would be hard to tell apart on screen (a symmetric corner)."""
    from PIL import ImageChops, ImageStat
    small = piece.convert('RGB').resize((48, 48))
    seen = [apply_opt(small, o) for o in opts]
    for i in range(len(seen)):
        for j in range(i + 1, len(seen)):
            diff = ImageStat.Stat(ImageChops.difference(seen[i], seen[j])).mean
            if sum(diff) / 3 < threshold:
                return True
    return False


def render_tile(source, crop, grid=3):
    """Cut the square out of the source photo and make the two files the game shows: the square with its
    bottom-right cell blanked (TILE_SIZE px) and that cell on its own. Returns (puzzle, piece, square) as
    PIL images."""
    from PIL import Image, ImageOps
    src = ImageOps.exif_transpose(source).convert('RGB')
    w, h = src.size
    size = min(crop['size'], w, h)
    x = min(max(0, crop['x']), w - size)
    y = min(max(0, crop['y']), h - size)
    square = src.crop((x, y, x + size, y + size)).resize((TILE_SIZE, TILE_SIZE), Image.Resampling.LANCZOS)
    cell = TILE_SIZE // grid
    left = TILE_SIZE - cell
    piece = square.crop((left, left, TILE_SIZE, TILE_SIZE))
    puzzle = square.copy()
    puzzle.paste(Image.new('RGB', (cell, cell), HOLE_COLOR), (left, left))
    return puzzle, piece, square


def webp_bytes(img, quality=82):
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=quality, method=5)
    return buf.getvalue()


# ------------------------------------------------------------------ the live overlay used by the game

class Live:
    """What new rounds draw from. Rebuilt from the state document after every publish and on a timer,
    so a publish on one server process reaches new rounds within a few seconds."""

    def __init__(self):
        self.lock = threading.Lock()
        self.overrides = {}   # id -> (type, data or None for 'off')
        self.assets = {}      # asset id -> public url
        self.rev = 0
        self.loaded_at = 0.0

    def load(self, state):
        overrides = {}
        for qid, e in (state or {}).get('items', {}).items():
            st = e.get('published_status')
            if st == 'approved':
                overrides[qid] = (e['type'], copy.deepcopy(e['published']))
            elif st == 'rejected':
                overrides[qid] = (e['type'], None)
        assets = {aid: a.get('url') for aid, a in (state or {}).get('assets', {}).items() if a.get('url')}
        with self.lock:
            self.overrides, self.assets = overrides, assets
            self.rev = (state or {}).get('rev', 0)
            self.loaded_at = time.time()

    def url(self, ref):
        m = ASSET_REF.match(ref or '')
        if m:
            return self.assets.get(m.group(1)) or ref
        return ref

    def pool(self, kind):
        """[(id, data)] live for a type: built-ins not overridden, then published ones."""
        with self.lock:
            ov = dict(self.overrides)
        out = []
        for qid, (t, data) in builtin().items():
            if t != kind:
                continue
            if qid in ov:
                if ov[qid][1] is not None:
                    out.append((qid, ov[qid][1]))
            else:
                out.append((qid, data))
        for qid, (t, data) in ov.items():
            if t == kind and qid not in builtin() and data is not None:
                out.append((qid, data))
        return out


LIVE = Live()


def picture_bank(kind):
    """The live picture questions of a kind in clock_race_bank's shape, picture keys resolved."""
    out = []
    for qid, d in LIVE.pool(kind):
        out.append(dict(id=qid, kind=kind, ar=d['ar'], en=d['en'],
                        options=[[LIVE.url(o[0]), o[1], o[2]] for o in d['options']],
                        difficulty=d.get('difficulty', 'medium'), fact=d.get('fact', ''), source=d.get('source', '')))
    return out or list(K.BY_KIND[kind])


def price_bank():
    out = []
    for qid, d in LIVE.pool('price'):
        opts = []
        for o in d['options']:
            o = dict(o)
            if o.get('image'):
                o['img'] = LIVE.url(o.pop('image'))
            opts.append(o)
        out.append(dict(id=qid, options=opts))
    return out


def photo_bank():
    out = []
    for qid, d in LIVE.pool('photo'):
        q = dict(id=qid, pic=LIVE.url(d['pic']), mode=d['mode'], ar=d['ar'], en=d['en'], options=[list(o) for o in d['options']])
        if d.get('landmark'):
            q['landmark'] = d['landmark']
        out.append(q)
    return out


def tile_set():
    """{pic id: {'opts': [...], 'img': url|None, 'piece': url|None}}"""
    out = {}
    for qid, d in LIVE.pool('tile'):
        r = d.get('rendered') or {}
        if d.get('pic') and not r.get('img'):
            out[qid] = dict(pic=d['pic'], opts=[list(o) for o in d['opts']], img=None, piece=None)
        elif r.get('img') and r.get('piece'):
            out[qid] = dict(pic=qid, opts=[list(o) for o in d['opts']], img=LIVE.url(r['img']), piece=LIVE.url(r['piece']),
                            grid=d.get('grid', 3))
    return out


def animal_list():
    return [(LIVE.url(d['key']), d['ar'], d['en']) for _, d in LIVE.pool('animal')]


def vote_list():
    return [(qid, d['ar'], d['en']) for qid, d in LIVE.pool('vote')]


# ------------------------------------------------------------------ studio summaries


def summary(state, assets=None):
    assets = assets if assets is not None else state.get('assets', {})
    rows = []
    for qid in all_ids(state):
        e = view(state, qid)
        probs = validate(e['type'], e['draft'], assets)
        rows.append(dict(id=qid, type=e['type'], status=e['status'], live=e['live'], dirty=e['dirty'],
                         origin=e['origin'], errors=sum(p['level'] == 'error' for p in probs),
                         warnings=sum(p['level'] == 'warn' for p in probs),
                         missing_image=any('picture missing' in p['msg'].lower() or 'photo missing' in p['msg'].lower()
                                           or 'no picture' in p['msg'].lower() or 'rendered' in p['msg'].lower() for p in probs),
                         title=item_title(e), thumb=item_thumb(e, assets), updated_at=e.get('updated_at'),
                         updated_by=e.get('updated_by')))
    return rows


def item_title(e):
    d = e['draft']
    if e['type'] == 'tile':
        return d.get('title') or f'Puzzle {e["id"]}'
    if e['type'] == 'price':
        return ' vs '.join(o.get('en', '') for o in d.get('options', []))
    if e['type'] == 'animal':
        return d.get('en', '')
    return d.get('en') or d.get('ar') or e['id']


def asset_url(ref, assets, thumb=False):
    m = ASSET_REF.match(ref or '')
    if not m:
        return None
    a = assets.get(m.group(1))
    if not a:
        return None
    return (a.get('thumb') if thumb else None) or a.get('url')


def item_thumb(e, assets):
    """A picture url for the library grid (relative urls are frontend public paths)."""
    d, t = e['draft'], e['type']
    if t == 'tile':
        r = d.get('rendered') or {}
        if r.get('img'):
            return asset_url(r['img'], assets, True)
        if d.get('pic'):
            return f'/clock-race/tiles/{d["pic"]}.webp'
        return None
    if t == 'photo':
        return asset_url(d.get('pic'), assets, True) or (f'/clock-race/photos/{d["pic"]}.webp' if d.get('pic') else None)
    if t == 'price':
        o = (d.get('options') or [{}])[0]
        return asset_url(o.get('image'), assets, True) or (f'/clock-race/art/prices/{o.get("key")}.webp' if o.get('key') else None)
    if t in PICTURE_KINDS:
        k = ((d.get('options') or [[None]])[0] or [None])[0]
        return asset_url(k, assets, True) or (f'@art:{k}' if k else None)
    if t == 'animal':
        return asset_url(d.get('key'), assets, True) or f'@art:{d.get("key")}'
    return None


def dumps(state):
    return json.dumps(state, ensure_ascii=False, separators=(',', ':'))


# ------------------------------------------------------------------ play preview


def preview_task(kind, d, assets):
    """The task exactly as the game would send it for this question (answer index included), with
    asset references turned into urls. Options keep their stored order: the first is the right one,
    except jigsaw pieces, which keep their stored (already shuffled) order."""
    def url(ref):
        return asset_url(ref, assets) or ref

    if kind in PICTURE_KINDS:
        opts = [[url(o[0]), o[1], o[2]] for o in d.get('options', [])]
        return dict(type=kind, qid='preview', ar=d.get('ar', ''), en=d.get('en', ''), options=opts, answer=0,
                    layout='board' if len(opts) == 4 else 'pair')
    if kind == 'price':
        opts = []
        for o in d.get('options', []):
            p = {k: o.get(k) for k in ('key', 'ar', 'en', 'unit_usd', 'quantity')}
            if o.get('image'):
                p['img'] = url(o['image'])
            opts.append(p)
        best = max(range(len(opts)), key=lambda i: (opts[i]['unit_usd'] or 0) * (opts[i]['quantity'] or 1)) if opts else 0
        return dict(type='price', qid='preview', options=opts, answer=best)
    if kind == 'photo':
        return dict(type='photo', qid='preview', pic=url(d.get('pic')), mode=d.get('mode', 'ask'), ar=d.get('ar', ''),
                    en=d.get('en', ''), options=[list(o) for o in d.get('options', [])], answer=0)
    if kind == 'tile':
        opts = [list(o) for o in d.get('opts', [])]
        t = dict(type='tile', pic=d.get('pic'), opts=opts, answer=next((i for i, o in enumerate(opts) if o[0] == 'none'), 0))
        r = d.get('rendered') or {}
        if r.get('img'):
            t.update(img=url(r['img']), piece=url(r['piece']))
        if d.get('grid') == 2:
            t['grid'] = 2
        return t
    if kind == 'animal':
        target = [url(d.get('key')), d.get('ar', ''), d.get('en', '')]
        return dict(type='animal', target=target, options=[target], answer=0, layout='board')
    if kind == 'vote':
        return dict(type='vote', question='preview', text=[d.get('ar', ''), d.get('en', '')], order=[])
    raise ValueError(kind)
