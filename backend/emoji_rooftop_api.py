"""Emoji Rooftop rooms, stored in the existing rooms table (encrypted flags), like Plot Twist.

The clue bank lives in one reserved rooms row (non-numeric code, so it can never
collide with a five-digit game room) and falls back to the built-in seed list.
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
BANK_CODE = 'emoji-rooftop-clue-bank'
ROOM_CODE_RE = re.compile(r'^\d{5}$')


class Create(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)
    rounds: int = Field(default=10, ge=1, le=engine.MAX_ROUNDS)


class Join(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)


class Action(BaseModel):
    action: Literal['start', 'replay', 'guess']
    text: str = Field(default='', max_length=120)
    round: int = -1
    run: str = ''
    rounds: Optional[int] = Field(default=None, ge=1, le=engine.MAX_ROUNDS)


class BankUpload(BaseModel):
    csv: str = Field(max_length=500_000)
    mode: Literal['replace', 'append'] = 'replace'


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
            raise HTTPException(404, 'Rooftop not found. Check the room code.')
        try:
            return json.loads(cipher().decrypt(flags[0][len(PREFIX):].encode())), result.data['wheel_winner_choice_id']
        except InvalidToken:
            raise HTTPException(503, 'Room cannot be decrypted with the current server key.')

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
            pid, token = credential.split(':', 1)
            if scheme.lower() != 'bearer':
                raise ValueError()
            return engine.authenticate(g, pid, token)
        except (ValueError, engine.GameError):
            raise HTTPException(403, 'Your session could not be verified. Rejoin on your original device.')

    async def bank():
        try:
            result = await query(lambda: db().table('rooms').select('flags').eq('code', BANK_CODE).maybe_single().execute())
        except HTTPException:
            raise
        except Exception:
            result = None
        flags = result.data.get('flags') if result and result.data else None
        if isinstance(flags, list) and flags and isinstance(flags[0], dict):
            return flags, True
        return list(engine.SEED), False

    # -------------------------------------------------------------- rooms

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try:
            g, p = engine.new_game(body.nickname, body.rounds)
        except engine.GameError as e:
            raise HTTPException(400, str(e))
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
            try:
                p = engine.add_player(g, body.nickname)
            except engine.GameError as e:
                raise HTTPException(400, str(e))
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
            result = None
            try:
                if body.action == 'guess':
                    result = engine.guess(g, p['id'], body.text, body.round, body.run, now)
                    if result != 'correct':
                        return dict(result=result, state=engine.view(g, p['id'], now))
                else:
                    if p['id'] != g['host']:
                        raise HTTPException(403, 'Only the host can do that.')
                    phase, _ = engine.position(g, now)
                    if body.action == 'start' and phase != 'lobby':
                        raise engine.GameError('The game has already started.')
                    if body.action == 'replay' and phase != 'ended':
                        raise engine.GameError('Finish this game first.')
                    clues, _ = await bank()
                    engine.start(g, clues, now, body.rounds)
            except engine.GameError as e:
                raise HTTPException(400, str(e))
            await save(code, g, old)
            return dict(result=result, state=engine.view(g, p['id'], now))

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
    async def get_clues(_: bool = Depends(require_admin)):
        clues, stored = await bank()
        return dict(count=len(clues), stored=stored, csv=engine.to_csv(clues))

    @api.put('/clues')
    async def put_clues(body: BankUpload, _: bool = Depends(require_admin)):
        parsed, errors = engine.parse_csv(body.csv)
        if errors:
            raise HTTPException(400, ' '.join(errors[:5]) + (f' (+{len(errors) - 5} more)' if len(errors) > 5 else ''))
        if body.mode == 'append':
            current, _ = await bank()
            seen = {engine.normalize(c['answer']) for c in current}
            parsed = current + [c for c in parsed if engine.normalize(c['answer']) not in seen]
        if not parsed:
            raise HTTPException(400, 'No clues found in that CSV.')
        existing = await query(lambda: db().table('rooms').select('code').eq('code', BANK_CODE).maybe_single().execute())
        if existing and existing.data:
            await query(lambda: db().table('rooms').update({'flags': parsed}).eq('code', BANK_CODE).execute())
        else:
            await query(lambda: db().table('rooms').insert({'code': BANK_CODE, 'flags': parsed,
                                                            'created_at': datetime.now(timezone.utc).isoformat()}).execute())
        return dict(count=len(parsed), stored=True, csv=engine.to_csv(parsed))

    return api
