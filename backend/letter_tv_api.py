"""Letter TV rooms, stored in the existing rooms table (encrypted flags), like Plot Twist and Emoji Rooftop.
WebSockets only say "refresh"; every screen then reads the one authoritative pair over HTTP.
"""
import asyncio
import base64
import hashlib
import json
import os
import re
import secrets
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Literal, Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Header, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import letter_tv as engine

PREFIX = 'letter_tv_v1:'
ROOM_CODE_RE = re.compile(r'^\d{5}$')


class Create(BaseModel):
    lang: Literal['en'] = 'en'
    avoid: Optional[List[str]] = None   # the arrangement this phone just showed; never repeat it


class Next(BaseModel):
    seq: int = Field(ge=0)


def router(db, query):
    api = APIRouter(prefix='/api/letter-tv')
    locks = defaultdict(asyncio.Lock)
    sockets = defaultdict(set)

    def cipher():
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        if not key:
            raise HTTPException(503, 'Room storage is not configured.')
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('letter-tv:' + key).encode()).digest()))

    def pack(g):
        return [PREFIX + cipher().encrypt(json.dumps(g).encode()).decode()]

    async def load(code):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'Room code must contain exactly five digits.')
        result = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', code).maybe_single().execute())
        flags = result.data.get('flags') if result and result.data else None
        if not flags or not isinstance(flags[0], str) or not flags[0].startswith(PREFIX):
            raise HTTPException(404, 'Room not found. Check the code.')
        try:
            g = json.loads(cipher().decrypt(flags[0][len(PREFIX):].encode()))
        except InvalidToken:
            raise HTTPException(503, 'Room cannot be decrypted with the current server key.')
        return g, result.data['wheel_winner_choice_id']

    async def save(code, g, old):
        result = await query(lambda: db().table('rooms').update({'flags': pack(g), 'wheel_winner_choice_id': secrets.token_hex(16)})
                             .eq('code', code).eq('wheel_winner_choice_id', old).execute())
        if not result.data:
            raise HTTPException(409, 'Room changed. Please try again.')
        await asyncio.gather(*(notify(ws) for ws in list(sockets[code])))

    async def notify(ws):
        try:
            await asyncio.wait_for(ws.send_json({'type': 'refresh'}), timeout=1)
        except Exception:
            pass

    def auth(g, authorization):
        try:
            scheme, credential = (authorization or '').split(' ', 1)
            sid, token = credential.split(':', 1)
            if scheme.lower() != 'bearer':
                raise ValueError()
            return engine.authenticate(g, sid, token)
        except (ValueError, engine.GameError):
            raise HTTPException(403, 'Your session could not be verified. Join the room again.')

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        g, host = engine.new_room(body.lang, body.avoid)
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
            return dict(code=code, id=host['id'], token=host['token'], state=engine.view(g, host['id']))
        raise HTTPException(503, 'Could not reserve a room. Try again.')

    @api.post('/rooms/{code}/join')
    async def join(code: str, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        async with locks[code]:
            g, old = await load(code)
            try:
                seat = engine.add_seat(g)
            except engine.GameError as e:
                raise HTTPException(400, str(e))
            await save(code, g, old)
            return dict(code=code, id=seat['id'], token=seat['token'], state=engine.view(g, seat['id']))

    @api.get('/rooms/{code}')
    async def state(code: str, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        g, _ = await load(code)
        return engine.view(g, auth(g, authorization)['id'])

    @api.post('/rooms/{code}/next')
    async def next_pair(code: str, body: Next, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            me = auth(g, authorization)
            if me['id'] != g['host']['id']:
                raise HTTPException(403, 'Only the host can change the letters.')
            if engine.press(g, body.seq):
                await save(code, g, old)
            return engine.view(g, me['id'])

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
