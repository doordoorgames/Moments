"""TikTok Memory rooms, stored in the existing rooms table (encrypted flags), like Emoji Rooftop."""
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
from typing import Any, Dict, Literal, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Header, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import tiktok_memory as engine

PREFIX = 'tiktok_memory_v1:'
Lang = Literal['en', 'ar']
ROOM_CODE_RE = re.compile(r'^\d{5}$')


class Create(BaseModel):
    name: str = Field(max_length=64)
    lang: Lang = 'en'
    length: int = engine.DEFAULT_LENGTH


class Join(BaseModel):
    name: str = Field(max_length=64)


class Action(BaseModel):
    action: Literal['start', 'replay', 'ready', 'finish', 'lock', 'next', 'tiebreak']
    length: Optional[int] = None


class Draw(BaseModel):
    drawings: Dict[str, Any]


class Mark(BaseModel):
    index: int
    value: Optional[bool] = None


def say(g, en, ar):
    return ar if engine.lang_of(g) == 'ar' else en


def router(db, query, clock=time.time):
    api = APIRouter(prefix='/api/tiktok-memory')
    locks = defaultdict(asyncio.Lock)
    sockets = defaultdict(set)

    def cipher():
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        if not key:
            raise HTTPException(503, 'Room storage is not configured.')
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('tiktok-memory:' + key).encode()).digest()))

    def pack(g):
        return [PREFIX + cipher().encrypt(json.dumps(g, separators=(',', ':')).encode()).decode()]

    async def load(code):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'Room code must contain exactly five digits.')
        result = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', code).maybe_single().execute())
        flags = result.data.get('flags') if result and result.data else None
        if not flags or not isinstance(flags[0], str) or not flags[0].startswith(PREFIX):
            raise HTTPException(404, 'Room not found. Check the code. · ما لقينا هالغرفة. تأكد من الكود.')
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

    def fail(g, e):
        return HTTPException(400, e.text(engine.lang_of(g)))

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try:
            g, p = engine.new_game(body.name, body.lang, body.length)
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
    async def join(code: str, body: Join, response: Response):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'Room code must contain exactly five digits.')
        response.headers['Cache-Control'] = 'no-store'
        async with locks[code]:
            g, old = await load(code)
            engine.settle(g, clock())
            try:
                p = engine.add_player(g, body.name)
            except engine.GameError as e:
                raise fail(g, e)
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
            engine.settle(g, now)
            try:
                a = body.action
                if a in ('start', 'replay', 'tiebreak') and p['id'] != g['host']:
                    raise engine.GameError('Only the host can do that.', 'بس المضيف يقدر يسوي هالشي.')
                if a == 'start':
                    engine.start(g, now, body.length)
                elif a == 'replay':
                    engine.replay(g, now, body.length)
                elif a == 'tiebreak':
                    engine.tiebreak(g, p['id'], now)
                elif a == 'ready':
                    engine.ready(g, p['id'], now)
                elif a == 'finish':
                    engine.finish_drawing(g, p['id'], now)
                elif a == 'lock':
                    engine.lock(g, p['id'])
                elif a == 'next':
                    engine.next_turn(g, p['id'], now)
            except engine.GameError as e:
                raise fail(g, e)
            await save(code, g, old)
            return dict(state=engine.view(g, p['id'], now))

    @api.post('/rooms/{code}/draw')
    async def draw(code: str, body: Draw, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            p = auth(g, authorization)
            now = clock()
            settled = engine.settle(g, now)
            try:
                changed = engine.submit(g, p['id'], body.drawings, now)
            except engine.GameError as e:
                raise fail(g, e)
            if changed or settled:
                await save(code, g, old)
            return dict(state=engine.view(g, p['id'], now))

    @api.post('/rooms/{code}/mark')
    async def mark(code: str, body: Mark, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            p = auth(g, authorization)
            now = clock()
            engine.settle(g, now)
            try:
                engine.mark(g, p['id'], body.index, body.value)
            except engine.GameError as e:
                raise fail(g, e)
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

    return api
