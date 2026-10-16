import copy
import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
import plot_twist as E
from plot_twist_api import router

def game(mode='story',n=2,rounds=1):
    g,p=E.new_game('Host',mode,rounds)
    for i in range(1,n):E.add_player(g,f'Friend {i}')
    E.start(g)
    return g

def send(g,text,request=None):
    p=g['players'][g['turn']%len(g['players'])]
    E.submit(g,p['id'],text,g['turn'],g['run'],request or f"{g['run']}:{g['turn']}")

@pytest.mark.parametrize('text,n',[(" Hi,  there!\nMy name's Fred.",5),('... !!!',0),('one-word count',2),('مرحبا يا أصحاب فوق هذا السطح',6),('ice cream pancake pancakes',4),('1 2 3 4 5',5)])
def test_count(text,n):assert len(E.words(text))==n

@pytest.mark.parametrize('mode,n,rounds',[(m,n,r) for m in ('story','trap') for n in range(2,9) for r in (1,3,10)])
def test_rotation_complete_replay(mode,n,rounds):
    g=game(mode,n,rounds)
    for i in range(n*rounds):
        assert g['turn']==i
        expected=g['players'][i%n]['id']
        send(g,'One two three four five' if mode=='story' else 'One two three four five six seven')
        assert g['contributions'][-1]['player']==expected
    assert g['status']=='ended' and len(g['contributions'])==n*rounds
    run=g['run'];E.start(g)
    assert g['run']!=run and g['turn']==0 and g['contributions']==[]
    assert all(p['score']==0 for p in g['players'])

@pytest.mark.parametrize('mode,text',[('story','one'),('story','one two three four'),('story','one two three four five six'),('trap','one two three four five'),('trap','one two three four five six seven eight'),('story','!!!')])
def test_invalid_counts(mode,text):
    g=game(mode);before=copy.deepcopy(g)
    with pytest.raises(E.GameError):send(g,text)
    assert g==before

def test_wrong_turn_stale_and_duplicate():
    g=game();p=g['players'][0];run=g['run']
    with pytest.raises(E.GameError):E.submit(g,g['players'][1]['id'],'One two three four five',0,run,'bad')
    send(g,'One two three four five','same')
    E.submit(g,p['id'],'One two three four five',0,run,'same')
    assert g['turn']==1
    with pytest.raises(E.GameError):E.submit(g,p['id'],'One two three four five',0,run,'other')
    with pytest.raises(E.GameError):E.submit(g,g['players'][1]['id'],'One two three four five',1,'old','other')

def test_whole_word_self_simultaneous_fresh():
    g=game('trap',3,3);a,b,c=[p['id'] for p in g['players']]
    g['targets']={a:'pancake',b:'ice',c:'cake'};g['used']=list(set(g['used']+['pancake','ice','cake','piano']))
    send(g,'Pancake pancakes nice icing cupcake cakes iceman')
    assert not g['traps']
    g['targets']={a:'pancake',b:'piano',c:'ice'}
    send(g,'She said “PANCAKE!” then grabbed some ICE.')
    assert g['players'][0]['score']==1 and g['players'][2]['score']==1
    assert len(g['traps'])==2
    assert g['targets'][a] not in ('pancake','ice','piano') and g['targets'][c]!=g['targets'][a]

def test_pool_max_deals():
    assert len(E.POOL)>=568
    g=game('trap',8,10)
    for _ in range(80):
        writer=g['players'][g['turn']%8]['id']
        targets=[w for p,w in g['targets'].items() if p!=writer]
        assert len(targets)==7
        send(g,' '.join(targets))
    assert len(g['used'])==568 and len(g['targets'])==8
    assert len(g['used'])==len(set(g['used']))

def test_views_capacity():
    g=game('trap',8);pid=g['players'][0]['id'];v=E.view(g,pid);raw=json.dumps(v)
    assert v['target']==g['targets'][pid] and 'targets' not in v and 'used' not in v
    for p in g['players']:
        assert p['token'] not in raw
        if p['id']!=pid:assert g['targets'][p['id']] not in raw
    with pytest.raises(E.GameError):E.add_player(g,'ninth')
    g,p=E.new_game('Host','story',1)
    with pytest.raises(E.GameError):E.start(g)
    with pytest.raises(E.GameError):E.add_player(g,' HOST ')

class Result:
    def __init__(self,data):self.data=data
class DB:
    def __init__(self):self.rows={}
    def table(self,_):return Query(self)
class Query:
    def __init__(self,db):self.db=db;self.filters={};self.op='select';self.body=None;self.single=False
    def select(self,*_):return self
    def eq(self,k,v):self.filters[k]=json.loads(v) if k=='flags' else v;return self
    def maybe_single(self):self.single=True;return self
    def insert(self,data):self.op='insert';self.body=data;return self
    def update(self,data):self.op='update';self.body=data;return self
    def execute(self):
        if self.op=='insert':self.db.rows[self.body['code']]=copy.deepcopy(self.body);return Result([self.body])
        rows=[r for r in self.db.rows.values() if all(r.get(k)==v for k,v in self.filters.items())]
        if self.op=='update':
            for r in rows:r.update(copy.deepcopy(self.body))
        return Result(copy.deepcopy(rows[0] if rows else None) if self.single else copy.deepcopy(rows))

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','test-only-key');db=DB()
    async def query(fn):return fn()
    app=FastAPI();app.include_router(router(lambda:db,query))
    with TestClient(app) as c:yield c,db

def headers(p):return {'Authorization':f"Bearer {p['player_id']}:{p['token']}"}
def create(c,**kw):return c.post('/api/plot-twist/rooms',json=dict(nickname='Host',mode='trap',rounds=1,**kw)).json()

def test_http_security_reconnect_lifecycle(client):
    c,db=client;a=create(c);url='/api/plot-twist/rooms/'+a['code'];b=c.post(url+'/join',json={'nickname':'Guest'}).json()
    assert c.get(url).status_code==403
    assert c.get(url,headers={'Authorization':'Bearer bad:bad'}).status_code==403
    assert c.get(url+'?as_player='+b['player_id'],headers=headers(a)).status_code==403
    assert c.post(url+'/action',json={'action':'start'},headers=headers(b)).status_code==403
    r=c.post(url+'/action',json={'action':'start'},headers=headers(a));assert r.status_code==200
    av=r.json();bv=c.get(url,headers=headers(b)).json()
    assert av['target']!=bv['target'] and av['target'] not in json.dumps(bv) and bv['target'] not in json.dumps(av)
    assert av['target'] not in json.dumps(db.rows) and a['token'] not in json.dumps(db.rows)
    assert c.get(url,headers=headers(a)).json()==av
    assert c.post(url+'/join',json={'nickname':'Late'}).status_code==400
    with c.websocket_connect(url+'/live') as ws:
        ws.send_json({'authorization':headers(a)['Authorization']});assert ws.receive_json()=={'type':'refresh'}
        r=c.post(url+'/action',headers=headers(a),json={'action':'submit','text':'one two three four five six seven','run':av['run'],'turn':0,'request_id':'first'})
        assert r.status_code==200 and ws.receive_json()=={'type':'refresh'}
    r=c.post(url+'/action',headers=headers(b),json={'action':'submit','text':'one two three four five six seven','run':av['run'],'turn':1,'request_id':'second'})
    assert r.json()['status']=='ended'
    assert c.post(url+'/action',headers=headers(a),json={'action':'replay'}).json()['turn']==0

def test_developer_seats_eight_limit(client):
    c,_=client;a=create(c,dev=True);url='/api/plot-twist/rooms/'+a['code']
    for _ in range(7):assert c.post(url+'/action',json={'action':'add_test'},headers=headers(a)).status_code==200
    assert c.post(url+'/action',json={'action':'add_test'},headers=headers(a)).status_code==400
    state=c.post(url+'/action',json={'action':'start'},headers=headers(a)).json()
    for p in state['players'][1:]:
        v=c.get(url+'?as_player='+p['id'],headers=headers(a));assert v.status_code==200 and v.json()['me']==p['id']

def test_unauthorized_socket_missing_room(client):
    c,_=client;a=create(c);url='/api/plot-twist/rooms/'+a['code']
    assert c.get('/api/plot-twist/rooms/NOTREAL',headers=headers(a)).status_code==404
    with c.websocket_connect(url+'/live') as ws:
        ws.send_json({'authorization':'Bearer fake:fake'})
        with pytest.raises(Exception):ws.receive_json()
