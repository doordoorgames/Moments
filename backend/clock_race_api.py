"""Clock Race rooms, stored in the existing rooms table (encrypted flags), like Letter TV and Plot Twist.
TEST99 rooms come with one simulated player ("Test Bot") whose clock follows a schedule set at the start.

Answers go over HTTP and the server judges every one. WebSockets push the public race picture
(who is at how many tasks) so the clock circles move without every phone re-reading the room.
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
from typing import Any, Literal

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Header, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

import clock_race as engine

PREFIX = 'clock_race_v1:'
ROOM_CODE_RE = re.compile(r'^\d{5}$')


class Nick(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)


class Create(Nick):
    lang: Literal['ar', 'en'] = 'ar'


class Start(BaseModel):
    round: str = Field(default='', max_length=40)


class Answer(BaseModel):
    round: str = Field(max_length=40)
    task: int = Field(ge=0, lt=engine.TASKS)
    answer: Any = None


class Dev(BaseModel):
    action: Literal['add', 'add_twin', 'solve']
    count: int = Field(default=1, ge=1, le=engine.MAX_PLAYERS)


def router(db, query):
    api = APIRouter(prefix='/api/clock-race')
    locks = defaultdict(asyncio.Lock)
    sockets = defaultdict(set)

    def cipher():
        key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
        if not key:
            raise HTTPException(503, 'Room storage is not configured.')
        return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('clock-race:' + key).encode()).digest()))

    def pack(g):
        return [PREFIX + cipher().encrypt(json.dumps(g).encode()).decode()]

    async def load(code):
        if not ROOM_CODE_RE.fullmatch(code):
            raise HTTPException(400, 'كود الغرفة لازم يكون خمس أرقام.')
        result = await query(lambda: db().table('rooms').select('flags,wheel_winner_choice_id').eq('code', code).maybe_single().execute())
        flags = result.data.get('flags') if result and result.data else None
        if not flags or not isinstance(flags[0], str) or not flags[0].startswith(PREFIX):
            raise HTTPException(404, 'ما لقينا هالغرفة. تأكد من الكود.')
        try:
            g = json.loads(cipher().decrypt(flags[0][len(PREFIX):].encode()))
        except InvalidToken:
            raise HTTPException(503, 'Room cannot be decrypted with the current server key.')
        if g.get('v') != engine.VERSION:
            raise HTTPException(410, 'This room is from an older version. Create a new room. · هالغرفة قديمة، سوّ غرفة جديدة.')
        return g, result.data['wheel_winner_choice_id']

    async def save(code, g, old, message=None):
        result = await query(lambda: db().table('rooms').update({'flags': pack(g), 'wheel_winner_choice_id': secrets.token_hex(16)})
                             .eq('code', code).eq('wheel_winner_choice_id', old).execute())
        if not result.data:
            raise HTTPException(409, 'الغرفة تغيرت. جرب مرة ثانية.')
        payload = message or {'type': 'refresh'}
        await asyncio.gather(*(notify(ws, payload) for ws in list(sockets[code])))

    async def notify(ws, payload):
        try:
            await asyncio.wait_for(ws.send_json(payload), timeout=1)
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
            raise HTTPException(403, 'ما قدرنا نتأكد منك. ادخل الغرفة من جديد.')

    def credentials(code, g, p):
        return dict(code=code, player_id=p['id'], token=p['token'], state=engine.view(g, p['id']))

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try:
            g, host = engine.new_room(body.nickname, body.lang)
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
            return credentials(code, g, host)
        raise HTTPException(503, 'ما قدرنا نفتح غرفة. جرب مرة ثانية.')

    @api.post('/rooms/{code}/join')
    async def join(code: str, body: Nick, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        async with locks[code]:
            g, old = await load(code)
            try:
                p = engine.add_player(g, body.nickname)
            except engine.GameError as e:
                raise HTTPException(400, str(e))
            await save(code, g, old)
            return credentials(code, g, p)

    @api.get('/rooms/{code}')
    async def state(code: str, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        g, old = await load(code)
        me = auth(g, authorization)
        if g['status'] == 'racing' and g.get('bots'):
            # simulated players move by the clock; write their progress down when it changed
            async with locks[code]:
                g, old = await load(code)
                if engine.sync_bots(g):
                    ended = g['status'] == 'finished'
                    await save(code, g, old, None if ended else {'type': 'progress', **engine.progress(g)})
        return engine.view(g, me['id'])

    @api.post('/rooms/{code}/start')
    async def start(code: str, body: Start, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            me = auth(g, authorization)
            if me['id'] != g['host']:
                raise HTTPException(403, 'المضيف بس يقدر يبدأ.')
            if engine.start(g, body.round):
                await save(code, g, old)
            return engine.view(g, me['id'])

    @api.post('/rooms/{code}/answer')
    async def answer(code: str, body: Answer, response: Response, authorization: str = Header(default='')):
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            me = auth(g, authorization)
            moved = engine.sync_bots(g)
            try:
                result = engine.answer(g, me['id'], body.round, body.task, body.answer)
            except engine.GameError as e:
                if moved:
                    await save(code, g, old)
                raise HTTPException(409, str(e))
            if result['changed'] or moved:
                ended = g['status'] == 'finished'
                await save(code, g, old, None if ended else {'type': 'progress', **engine.progress(g)})
            out = {k: v for k, v in result.items() if k != 'changed'}
            out['race'] = engine.progress(g)
            if g['status'] == 'finished':
                out['state'] = engine.view(g, me['id'])
            return out

    @api.post('/rooms/{code}/dev')
    async def dev(code: str, body: Dev, response: Response, authorization: str = Header(default='')):
        """TEST99 rooms only: add test players, move them, or solve your own current task."""
        response.headers['Cache-Control'] = 'private, no-store'
        async with locks[code]:
            g, old = await load(code)
            me = auth(g, authorization)
            if not g['dev'] or me['id'] != g['host']:
                raise HTTPException(403, 'Developer controls are only for TEST99 rooms.')
            try:
                if body.action == 'add':
                    for _ in range(body.count):
                        taken = {p['name'] for p in g['players']}
                        name = next((n for n in engine.BOT_NAMES if n not in taken), f'لاعب {len(g["players"]) + 1}')
                        engine.add_player(g, name, sim=True)
                elif body.action == 'add_twin':
                    engine.add_player(g, me['name'], sim=True)  # same nickname as the host
                elif body.action == 'solve' and g['status'] == 'racing':
                    i = len(g['progress'].get(me['id'], []))
                    if i < engine.TASKS:
                        # skips the memory display wait: solving is a test shortcut
                        engine.answer(g, me['id'], g['round']['id'], i,
                                      engine.solve(g['round']['tasks'][i], [p['id'] for p in g['roster']]),
                                      max(engine.reached_at(g, me['id'], i) + engine.show_time(g['round']['tasks'][i]), time.time()))
            except engine.GameError as e:
                raise HTTPException(400, str(e))
            await save(code, g, old)
            return engine.view(g, me['id'])

    @api.websocket('/rooms/{code}/live')
    async def live(ws: WebSocket, code: str):
        await ws.accept()
        try:
            creds = await asyncio.wait_for(ws.receive_json(), 10)
            g, _ = await load(code)
            auth(g, creds.get('authorization', ''))
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
