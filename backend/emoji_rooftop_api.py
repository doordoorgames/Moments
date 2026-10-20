"""Emoji Rooftop rooms, stored in the existing rooms table (encrypted flags), like Plot Twist.

There are two clue banks, Emoji English and Emoji Arabic. Each lives in its own
reserved rooms row (non-numeric code, so it can never collide with a five-digit
game room) and falls back to its built-in seed list. A room plays from the bank
of the language its host picked.
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, Header, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import emoji_rooftop as engine

PREFIX = 'emoji_rooftop_v1:'
BANK_CODES = {'en': 'emoji-rooftop-clue-bank', 'ar': 'emoji-rooftop-clue-bank-ar'}
Lang = Literal['en', 'ar']
ROOM_CODE_RE = re.compile(r'^\d{5}$')


class Create(BaseModel):
    rounds: int = Field(default=10, ge=1, le=engine.MAX_ROUNDS)
    lang: Lang = 'en'


class Action(BaseModel):
    action: Literal['start', 'replay', 'reveal', 'next']
    rounds: Optional[int] = Field(default=None, ge=1, le=engine.MAX_ROUNDS)


class BankUpload(BaseModel):
    csv: str = Field(max_length=500_000)
    mode: Literal['replace', 'append'] = 'replace'


def say(g, en, ar):
    return ar if engine.lang_of(g) == 'ar' else en


def router(db, query, require_admin, clock=time.time):
    api = APIRouter(prefix='/api/emoji-rooftop')
    locks = defaultdict(asyncio.Lock)
    sockets = defaultdict(set)

    def cipher():
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        if not key:
            raise HTTPException(503, 'Room storage is not configured.')
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('emoji-rooftop:' + key).encode()).digest()))

    def pack(g):
        return [PREFIX + cipher().encrypt(json.dumps(g).encode()).decode()]

    async def load(code):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'Room code must contain exactly five digits.')
        result = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', code).maybe_single().execute())
        flags = result.data.get('flags') if result and result.data else None
        if not flags or not isinstance(flags[0], str) or not flags[0].startswith(PREFIX):
            raise HTTPException(404, 'Rooftop not found. Check the room code. · ما لقينا هالغرفة. تأكد من الكود.')
        try:
            g = json.loads(cipher().decrypt(flags[0][len(PREFIX):].encode()))
        except InvalidToken:
            raise HTTPException(503, 'Room cannot be decrypted with the current server key.')
        if g.get('v') != engine.VERSION:
            raise HTTPException(404, 'This room is from an older version. Create a new one. · هالغرفة قديمة. سوّ غرفة جديدة.')
        return g, result.data['wheel_winner_choice_id']

    async def save(code, g, old):
        result = await query(lambda: db().table('rooms').update({'flags': pack(g), 'wheel_winner_choice_id': secrets.token_hex(16)})
                             .eq('code', code).eq('wheel_winner_choice_id', old).execute())
        if not result.data:
            raise HTTPException(409, say(g, 'Room changed. Please try again.', 'الغرفة تغيرت. جرب مرة ثانية.'))
        await asyncio.gather(*(notify(ws) for ws in list(sockets[code])))

    async def notify(ws):
        try:
            await asyncio.wait_for(ws.send_json({'type': 'refresh'}), timeout=1)
        except Exception:
            pass

    def auth(g, authorization):
        try:
            scheme, credential = (authorization or '').split(' ', 1)
            pid, token = credential.split(':', 1)
            if scheme.lower() != 'bearer':
                raise ValueError()
            return engine.authenticate(g, pid, token)
        except (ValueError, engine.GameError):
            raise HTTPException(403, say(g, 'Your session could not be verified. Rejoin on your original device.',
                                         'ما قدرنا نتأكد منك. ارجع من نفس الجهاز اللي دخلت منه.'))

    async def bank(lang):
        code = BANK_CODES[lang]
        try:
            result = await query(lambda: db().table('rooms').select('flags').eq('code', code).maybe_single().execute())
        except HTTPException:
            raise
        except Exception:
            result = None
        flags = result.data.get('flags') if result and result.data else None
        if isinstance(flags, list) and flags and isinstance(flags[0], dict):
            return flags, True
        return list(engine.SEEDS[lang]), False

    # -------------------------------------------------------------- rooms

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try:
            g, p = engine.new_game(body.rounds, body.lang)
        except engine.GameError as e:
            raise HTTPException(400, e.text(body.lang))
        for _ in range(50):
            code = f'{secrets.randbelow(100000):05d}'
            existing = await query(lambda: db().table('rooms').select('code').eq('code', code).maybe_single().execute())
            if existing and existing.data:
                continue
            try:
                await query(lambda: db().table('rooms').insert({'code': code, 'flags': pack(g), 'wheel_winner_choice_id': secrets.token_hex(16),
                                                                'created_at': datetime.now(timezone.utc).isoformat()}).execute())
            except Exception as exc:
                if 'duplicate' in str(exc).lower() or '23505' in str(exc):
                    continue
                raise
            return dict(code=code, player_id=p['id'], token=p['token'], state=engine.view(g, p['id'], clock()))
        raise HTTPException(503, 'Could not reserve a room. Try again.')

    @api.post('/rooms/{code}/join')
    async def join(code: str, response: Response):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'Room code must contain exactly five digits.')
        response.headers['Cache-Control'] = 'no-store'
        async with locks[code]:
            g, old = await load(code)
            try:
                p = engine.add_seat(g)
            except engine.GameError as e:
                raise HTTPException(400, e.text(engine.lang_of(g)))
            await save(code, g, old)
            return dict(code=code, player_id=p['id'], token=p['token'], state=engine.view(g, p['id'], clock()))

    @api.get('/rooms/{code}')
    async def state(code: str, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        g, _ = await load(code)
        p = auth(g, authorization)
        return engine.view(g, p['id'], clock())

    @api.post('/rooms/{code}/action')
    async def action(code: str, body: Action, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            p = auth(g, authorization)
            now = clock()
            if p['id'] != g['host']:
                raise HTTPException(403, say(g, 'Only the host can do that.', 'بس المضيف يقدر يسوي هالشي.'))
            try:
                if body.action == 'reveal':
                    engine.reveal(g, now)
                elif body.action == 'next':
                    engine.next_round(g, now)
                else:
                    if body.action == 'start' and g['status'] != 'lobby':
                        raise engine.GameError('The game has already started.', 'اللعبة بدت خلاص.')
                    if body.action == 'replay' and g['status'] != 'ended':
                        raise engine.GameError('Finish this game first.', 'خلصوا اللعبة أول.')
                    clues, _ = await bank(engine.lang_of(g))
                    engine.start(g, clues, now, body.rounds)
            except engine.GameError as e:
                raise HTTPException(400, e.text(engine.lang_of(g)))
            await save(code, g, old)
            return dict(state=engine.view(g, p['id'], now))

    @api.websocket('/rooms/{code}/live')
    async def live(ws: WebSocket, code: str):
        await ws.accept()
        try:
            credentials = await asyncio.wait_for(ws.receive_json(), 10)
            g, _ = await load(code)
            auth(g, credentials.get('authorization', ''))
            sockets[code].add(ws)
            await ws.send_json({'type': 'refresh'})
            while True:
                await asyncio.wait_for(ws.receive_text(), 60)
                await ws.send_json({'type': 'pong'})
        except (WebSocketDisconnect, asyncio.TimeoutError, HTTPException, ValueError, TypeError):
            pass
        finally:
            sockets[code].discard(ws)
            try:
                await ws.close()
            except Exception:
                pass

    # -------------------------------------------------------------- clue bank (admin)

    @api.get('/clues')
    async def get_clues(lang: Lang = 'en', _: bool = Depends(require_admin)):
        clues, stored = await bank(lang)
        return dict(lang=lang, count=len(clues), stored=stored, csv=engine.to_csv(clues))

    @api.put('/clues')
    async def put_clues(body: BankUpload, lang: Lang = 'en', _: bool = Depends(require_admin)):
        code = BANK_CODES[lang]
        parsed, errors = engine.parse_csv(body.csv)
        if errors:
            raise HTTPException(400, ' '.join(errors[:5]) + (f' (+{len(errors) - 5} more)' if len(errors) > 5 else ''))
        if body.mode == 'append':
            current, _ = await bank(lang)
            seen = {engine.normalize(c['answer']) for c in current}
            parsed = current + [c for c in parsed if engine.normalize(c['answer']) not in seen]
        if not parsed:
            raise HTTPException(400, 'No clues found in that CSV.')
        existing = await query(lambda: db().table('rooms').select('code').eq('code', code).maybe_single().execute())
        if existing and existing.data:
            await query(lambda: db().table('rooms').update({'flags': parsed}).eq('code', code).execute())
        else:
            await query(lambda: db().table('rooms').insert({'code': code, 'flags': parsed,
                                                            'created_at': datetime.now(timezone.utc).isoformat()}).execute())
        return dict(lang=lang, count=len(parsed), stored=True, csv=engine.to_csv(parsed))

    return api
