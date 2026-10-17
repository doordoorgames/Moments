"""Supabase-backed room transport. Uses existing rooms, encrypted at rest with a server-only key.
Compare-and-swap prevents lost turns even if another process receives a concurrent request.
WebSockets carry invalidations only; all private state requires a bearer session over HTTP.
"""
import asyncio
import base64
import hashlib
import json
import os
import secrets
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Header, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
import plot_twist as engine

PREFIX = 'plot_twist_v1:'
ROOM_CODE_RE = re.compile(r'^\d{5}$')

class Create(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)
    mode: Literal['story','trap'] = 'story'
    rounds: int = Field(default=3, ge=1, le=10)
    dev: bool = False
class Join(BaseModel):
    nickname: str = Field(min_length=1, max_length=100)
class Action(BaseModel):
    action: Literal['start','replay','submit','add_test']
    text: str = Field(default='', max_length=350)
    turn: int = 0
    run: str = ''
    request_id: str = Field(default='', max_length=80)
    as_player: str = ''


def router(db, query):
    api = APIRouter(prefix='/api/plot-twist')
    locks = defaultdict(asyncio.Lock)
    sockets = defaultdict(set)

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
            raise HTTPException(404, 'Rooftop not found. Check the room code.')
        try: return json.loads(cipher().decrypt(flags[0][len(PREFIX):].encode())), result.data['wheel_winner_choice_id']
        except InvalidToken: raise HTTPException(503, 'Room cannot be decrypted with the current server key.')

    def auth(g, authorization):
        try:
            scheme, credential = (authorization or '').split(' ', 1)
            pid, token = credential.split(':', 1)
            if scheme.lower() != 'bearer': raise ValueError()
            return engine.authenticate(g, pid, token)
        except (ValueError, engine.GameError):
            raise HTTPException(403, 'Your session could not be verified. Rejoin on your original device.')

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
        if not result.data: raise HTTPException(409, 'Room changed. Please try again.')
        await asyncio.gather(*(notify(ws) for ws in list(sockets[code])))

    async def notify(ws):
        try: await asyncio.wait_for(ws.send_json({'type':'refresh'}), timeout=1)
        except Exception: pass

    @api.post('/rooms')
    async def create(body: Create, response: Response):
        response.headers['Cache-Control'] = 'no-store'
        try: g, p = engine.new_game(body.nickname, body.mode, body.rounds, body.dev)
        except engine.GameError as e: raise HTTPException(400, str(e))
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
            except engine.GameError as e: raise HTTPException(400, str(e))
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
                else:
                    if p['id'] != g['host']: raise HTTPException(403,'Only the host can do that.')
                    if body.action == 'add_test':
                        if not g['dev']: raise HTTPException(403,'This is not a developer room.')
                        engine.add_player(g,f"Guest {len(g['players']) + 1}",True)
                    elif body.action == 'replay':
                        if g['status'] != 'ended': raise engine.GameError('Finish this story first.')
                        engine.start(g)
                    else:
                        if g['status'] != 'lobby': raise engine.GameError('The story has already started.')
                        engine.start(g)
            except engine.GameError as e: raise HTTPException(400,str(e))
            await save(code,g,old)
            return engine.view(g,pid)

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
