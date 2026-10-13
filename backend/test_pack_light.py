import asyncio
import copy
import json
from datetime import timedelta
from types import SimpleNamespace
import pytest
from fastapi import HTTPException
import server
from pack_light import PackLightResult, read_pack

class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, {}
        self.op, self.payload, self.single = 'select', None, False
    def select(self, *args, **kwargs): return self
    def eq(self, k, v):
        self.filters[k] = json.loads(v) if k == 'flags' and isinstance(v,str) else v
        return self
    def maybe_single(self): self.single=True; return self
    def insert(self,p): self.op,self.payload='insert',p; return self
    def update(self,p): self.op,self.payload='update',p; return self
    def delete(self): self.op='delete'; return self
    def execute(self):
        rows=self.db.rows[self.table]; found=[r for r in rows if all(r.get(k)==v for k,v in self.filters.items())]
        if self.op=='insert': rows.append(copy.deepcopy(self.payload))
        if self.op=='update':
            for r in found:r.update(copy.deepcopy(self.payload))
        if self.op=='delete':
            for r in found:rows.remove(r)
        return SimpleNamespace(data=copy.deepcopy((found[0] if found else None) if self.single else found),count=len(found))

@pytest.fixture
def game(monkeypatch):
    db=SimpleNamespace(rows={'rooms':[{'code':'PACK','presentation':'shoug2','story_id':'story','started':False,'phase':'lobby','flags':[]}], 'players':[
        {'id':'host','room_code':'PACK','nickname':'Host','is_host':True,'session_token':'ht'},
        {'id':'guest','room_code':'PACK','nickname':'Guest','is_host':False,'session_token':'gt'}], 'votes':[]})
    db.table=lambda n:Query(db,n)
    monkeypatch.setattr(server,'supa',db)
    async def room(code):return copy.deepcopy(db.rows['rooms'][0]) if code=='PACK' else None
    async def player(pid):return next((copy.deepcopy(p) for p in db.rows['players'] if p['id']==pid),None)
    async def story(sid):return {'id':'story','title':'Shoug’s Tale','start_node_id':'first'}
    async def node(nid):return {'id':'first','story_id':'story','node_type':'narration','story_text':'London today','narration_next_node_id':'next','choices':[]}
    for name,fn in [('get_room',room),('get_player',player),('get_story',story),('get_node',node)]:monkeypatch.setattr(server,name,fn)
    async def no_timer(*args):raise AssertionError('Packing/narration must not run story timers')
    monkeypatch.setattr(server,'_start_phase_task',no_timer)
    return db

def session(pid='host'):return server.RoomSessionRequest(player_id=pid,session_token='ht' if pid=='host' else 'gt')
def submit(run,pid='host'):return server.PackLightSubmission(**session(pid).model_dump(),run_id=run,result=PackLightResult(finalScore=67,grade='First Class Energy',comfortScore=25,monochromeScore=12,bagWeight=18.5,overweight=False))

def test_two_players_wait_then_start_once_and_persist(game):
    async def run():
        start=await server.start_room('PACK',session());rid=start['pack_light']['run_id']
        assert start['current_node'] is None and start['room']['phase']=='pack_light'
        first=await server.submit_pack_light('PACK',submit(rid))
        assert first['room']['phase']=='pack_light' and first['pack_light']['done_count']==1
        assert first['pack_light']['total_count']==2 and not first['pack_light']['host_can_continue']
        assert first['room']['flags']==[]
        refreshed=await server.compute_room_state('PACK')
        assert refreshed['pack_light']['results']['host']['bagWeight']==18.5
        final=await server.submit_pack_light('PACK',submit(rid,'guest'))
        assert final['current_node']['id']=='first' and final['room']['phase']=='narration'
        assert final['pack_light']['done_count']==2 and final['pack_light']['completed_at']
        duplicate=await server.submit_pack_light('PACK',submit(rid,'guest'))
        assert duplicate['pack_light']['completed_at']==final['pack_light']['completed_at']
        await server.reset_room('PACK',session());replay=await server.start_room('PACK',session())
        assert replay['pack_light']['run_id']!=rid and replay['pack_light']['results']=={}
        with pytest.raises(HTTPException) as stale:await server.submit_pack_light('PACK',submit(rid))
        assert stale.value.status_code==409
    asyncio.run(run())

def test_simultaneous_completions_preserve_both(game):
    async def run():
        start=await server.start_room('PACK',session());rid=start['pack_light']['run_id']
        await asyncio.gather(server.submit_pack_light('PACK',submit(rid)),server.submit_pack_light('PACK',submit(rid,'guest')))
        state=await server.compute_room_state('PACK')
        assert state['current_node']['id']=='first' and set(state['pack_light']['results'])=={'host','guest'}
    asyncio.run(run())

def test_host_escape_after_server_90_seconds(game):
    async def run():
        start=await server.start_room('PACK',session());rid=start['pack_light']['run_id']
        await server.submit_pack_light('PACK',submit(rid));payload=server.PackLightContinue(**session().model_dump(),run_id=rid)
        with pytest.raises(HTTPException) as early:await server.force_pack_light_continue('PACK',payload)
        assert early.value.status_code==409
        pack=read_pack(game.rows['rooms'][0]);pack['waiting_started_at']=(server._now()-timedelta(seconds=91)).isoformat()
        game.rows['rooms'][0]['flags']=server.pack_flags([],pack)
        with pytest.raises(HTTPException) as guest:await server.force_pack_light_continue('PACK',server.PackLightContinue(**session('guest').model_dump(),run_id=rid))
        assert guest.value.status_code==403
        final=await server.force_pack_light_continue('PACK',payload)
        assert final['current_node']['id']=='first' and final['pack_light']['forced_by_host']
    asyncio.run(run())

def test_auth_classic_scope_and_no_gameplay_regression(game):
    async def run():
        with pytest.raises(HTTPException) as guest:await server.start_room('PACK',session('guest'))
        assert guest.value.status_code==403
        start=await server.start_room('PACK',session());rid=start['pack_light']['run_id']
        bad=submit(rid);bad.session_token='wrong'
        with pytest.raises(HTTPException) as spoof:await server.submit_pack_light('PACK',bad)
        assert spoof.value.status_code==403
        game.rows['rooms'][0].update(presentation='classic',started=False,phase='lobby',flags=[])
        await server.start_room('PACK',session())
        assert game.rows['rooms'][0]['current_node_id']=='first' and read_pack(game.rows['rooms'][0]) is None
        with pytest.raises(HTTPException) as blocked:await server.submit_pack_light('PACK',submit(rid))
        assert blocked.value.status_code==403
    asyncio.run(run())

def test_cors_approved_previews_and_production():
    from fastapi.testclient import TestClient
    client=TestClient(server.app);headers={'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}
    for origin in ['https://moments-kyd3rfsjj-doordoorgames-projects.vercel.app','https://moments-git-feature-shoug-2-presentation-doordoorgames-projects.vercel.app','https://moments-ten-psi.vercel.app']:
        response=client.options('/api/rooms',headers={**headers,'Origin':origin})
        assert response.status_code==200 and response.headers['access-control-allow-origin']==origin
    assert client.options('/api/rooms',headers={**headers,'Origin':'https://other-project.vercel.app'}).status_code==400
