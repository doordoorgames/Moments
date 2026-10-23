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
    if mode=='trap':
        # Word Trap never ends on its own; the host ends it.
        assert g['status']=='active' and g['rounds']==0
        E.end(g)
    assert g['status']=='ended' and len(g['contributions'])==n*rounds
    run=g['run'];E.start(g)
    assert g['run']!=run and g['turn']==0 and g['contributions']==[]
    assert all(p['score']==0 for p in g['players'])

@pytest.mark.parametrize('mode,text',[('story','one'),('story','one two three four'),('story','one two three four five six'),('trap','one two three four'),('trap',' '.join(['w']*16)),('story','!!!')])
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

@pytest.mark.parametrize('n',[5,9,15])
def test_trap_range(n):
    g=game('trap');send(g,' '.join(['word']*n));assert g['turn']==1

@pytest.mark.parametrize('lang',['en','ar'])
def test_pool_recycles_in_open_story(lang):
    g,_=E.new_game('Host','trap',1,lang=lang)
    for i in range(1,8):E.add_player(g,f'Friend {i}')
    E.start(g);size=len(E.pool(g))
    for _ in range(size):
        writer=g['players'][g['turn']%8]['id']
        targets=[w for p,w in g['targets'].items() if p!=writer][:15]
        send(g,' '.join(targets+['x']*(5-len(targets))))
        live=list(g['targets'].values())
        assert len(g['targets'])==8 and len(set(live))==8
    assert g['status']=='active'

def test_arabic_matching_and_language():
    g,_=E.new_game('خالد','trap',1,lang='ar');E.add_player(g,'سعود');E.start(g)
    a,b=[p['id'] for p in g['players']]
    assert E.view(g,a)['lang']=='ar' and E.view(g,a)['min_words']==5 and E.view(g,a)['max_words']==15
    assert all(w in E.AR_POOL for w in g['targets'].values())
    g['targets'][b]='قطة'
    send(g,'وفجأة طلعت القطّة من الشباك وركضت')
    assert g['players'][1]['score']==1
    g['targets'][a]='مكيف'
    send(g,'شغلوا المكيفات لأن الجو حر')
    assert g['players'][0]['score']==0
    with pytest.raises(E.GameError) as e:send(g,'كلمة')
    assert e.value.text('ar').startswith('اكتب')
    with pytest.raises(E.GameError):E.new_game('x','trap',1,lang='fr')

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
    assert r.json()['status']=='active'
    assert c.post(url+'/action',headers=headers(b),json={'action':'end'}).status_code==403
    assert c.post(url+'/action',headers=headers(a),json={'action':'end'}).json()['status']=='ended'
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
    assert c.get('/api/plot-twist/rooms/NOTREAL',headers=headers(a)).status_code==400
    missing='00000' if a['code']!='00000' else '00001'
    assert c.get('/api/plot-twist/rooms/'+missing,headers=headers(a)).status_code==404
    with c.websocket_connect(url+'/live') as ws:
        ws.send_json({'authorization':'Bearer fake:fake'})
        with pytest.raises(Exception):ws.receive_json()

def test_host_language_wins_for_joiners(client):
    c,_=client;a=create(c,lang='ar');url='/api/plot-twist/rooms/'+a['code']
    assert a['state']['lang']=='ar'
    b=c.post(url+'/join',json={'nickname':'Guest'}).json();assert b['state']['lang']=='ar'
    r=c.post(url+'/join',json={'nickname':'guest'});assert r.status_code==400 and 'هالاسم' in r.json()['detail']

# ------------------------------------------------------------------ Word Trap rerolls

def swap(g,pid,request=None,used=None,secret=None):
    v=E.view(g,pid)
    E.reroll(g,pid,v['secret_id'] if secret is None else secret,v['rerolls_used'] if used is None else used,request or f"r{v['rerolls_used']}:{v['target']}")

@pytest.mark.parametrize('lang',['en','ar'])
def test_reroll_three_then_locked(lang):
    g,_=E.new_game('Host','trap',0,lang=lang);E.add_player(g,'Guest');E.start(g)
    a,b=[p['id'] for p in g['players']];other=g['targets'][b]
    assert E.view(g,a)['rerolls_used']==0 and E.view(g,a)['rerolls_max']==3
    seen=[g['targets'][a]]
    for n in (1,2,3):
        swap(g,a);v=E.view(g,a)
        assert v['rerolls_used']==n and v['target'] not in seen and v['target']!=other
        assert v['target'] in E.pool(g)
        seen.append(v['target'])
    before=copy.deepcopy(g)
    with pytest.raises(E.GameError):swap(g,a)
    assert g==before
    # The other player's word and allowance never moved.
    assert g['targets'][b]==other and E.view(g,b)['rerolls_used']==0
    swap(g,b);assert E.view(g,b)['rerolls_used']==1 and E.view(g,a)['rerolls_used']==3

def test_reroll_duplicate_and_double_tap():
    g=game('trap');a=g['players'][0]['id']
    v=E.view(g,a)
    E.reroll(g,a,v['secret_id'],0,'tap-1');word=g['targets'][a];version=g['version']
    # Same request retried: nothing spent, word kept.
    E.reroll(g,a,v['secret_id'],0,'tap-1')
    assert g['targets'][a]==word and E.view(g,a)['rerolls_used']==1 and g['version']==version
    # A second tap sent before the first came back (still says 0 used) is refused.
    with pytest.raises(E.GameError):E.reroll(g,a,v['secret_id'],0,'tap-2')
    assert g['targets'][a]==word and E.view(g,a)['rerolls_used']==1

def test_reroll_failure_keeps_word_and_count():
    g=game('trap');a=g['players'][0]['id'];word=g['targets'][a]
    with pytest.raises(E.GameError):E.reroll(g,a,'not-this-assignment',0,'x')
    with pytest.raises(E.GameError):E.reroll(g,a,E.view(g,a)['secret_id'],0,'')
    assert g['targets'][a]==word and E.view(g,a)['rerolls_used']==0

def test_reroll_scores_against_replacement_and_trap_gives_fresh_allowance():
    g=game('trap',2,1);a,b=[p['id'] for p in g['players']]
    old=g['targets'][b];swap(g,b);new=g['targets'][b]
    assert E.view(g,b)['rerolls_used']==1
    send(g,f'one two three four {old}')  # host writes the replaced word: no score
    assert g['players'][1]['score']==0
    send(g,'one two three four five')     # guest's turn
    send(g,f'one two three four {new}')   # host writes the replacement: guest scores
    assert g['players'][1]['score']==1 and g['targets'][b] not in (old,new)
    v=E.view(g,b);assert v['rerolls_used']==0 and v['secret_id']
    # A swap aimed at the word that was just trapped is refused, not spent.
    with pytest.raises(E.GameError):E.reroll(g,b,'stale-id',1,'late')
    assert E.view(g,b)['rerolls_used']==0

def test_reroll_only_during_active_trap_and_replay_resets():
    g=game('story');a=g['players'][0]['id']
    with pytest.raises(E.GameError):E.reroll(g,a,'',0,'s')
    g=game('trap');a=g['players'][0]['id']
    for _ in range(3):swap(g,a)
    E.end(g)
    with pytest.raises(E.GameError):swap(g,a)
    E.start(g);assert E.view(g,a)['rerolls_used']==0

def test_reroll_view_is_private():
    g=game('trap',3);a,b,c=[p['id'] for p in g['players']]
    first=g['targets'][a];swap(g,a);swap(g,a)
    for pid in (b,c):
        raw=json.dumps(E.view(g,pid))
        assert first not in raw and g['targets'][a] not in raw and 'secrets' not in raw and 'seen' not in raw

def test_reroll_legacy_room_without_allowances():
    g=game('trap');a=g['players'][0]['id'];del g['secrets']
    v=E.view(g,a);assert v['rerolls_used']==0
    E.reroll(g,a,v['secret_id'],0,'legacy');assert E.view(g,a)['rerolls_used']==1

def test_http_reroll_lifecycle(client):
    c,db=client;a=create(c);url='/api/plot-twist/rooms/'+a['code'];b=c.post(url+'/join',json={'nickname':'Guest'}).json()
    av=c.post(url+'/action',json={'action':'start'},headers=headers(a)).json();bv=c.get(url,headers=headers(b)).json()
    def go(p,v,rid,**kw):
        return c.post(url+'/action',headers=headers(p),json=dict(action='reroll',run=v['run'],secret=v['secret_id'],used=v['rerolls_used'],request_id=rid,**kw))
    words=[av['target']]
    for n in (1,2,3):
        r=go(a,av,f'a{n}');assert r.status_code==200
        av=r.json();assert av['rerolls_used']==n and av['target'] not in words;words.append(av['target'])
        assert all(w not in json.dumps(av['players']) for w in words)
    r=go(a,av,'a4');assert r.status_code==400
    # Refresh and reconnect keep the word and the count.
    again=c.get(url,headers=headers(a)).json();assert again['target']==av['target'] and again['rerolls_used']==3
    assert av['target'] not in json.dumps(db.rows)
    # The guest still has a full allowance, and never sees the host's words.
    bv=c.get(url,headers=headers(b)).json();assert bv['rerolls_used']==0
    assert all(w not in json.dumps(bv) for w in words)
    r=go(b,bv,'b1');assert r.status_code==200 and r.json()['rerolls_used']==1
    # Duplicate retry is harmless; a stale double tap is refused; a stale run is refused.
    assert go(b,bv,'b1').json()['rerolls_used']==1
    assert go(b,bv,'b2').status_code==400
    assert c.post(url+'/action',headers=headers(b),json=dict(action='reroll',run='old',secret=bv['secret_id'],used=1,request_id='b3')).status_code==400
    assert c.get(url,headers=headers(b)).json()['rerolls_used']==1
    assert c.post(url+'/action',headers={'Authorization':'Bearer x:y'},json=dict(action='reroll',run=bv['run'],request_id='z')).status_code==403

def test_http_reroll_developer_seat(client):
    c,_=client;a=create(c,dev=True);url='/api/plot-twist/rooms/'+a['code']
    c.post(url+'/action',json={'action':'add_test'},headers=headers(a))
    state=c.post(url+'/action',json={'action':'start'},headers=headers(a)).json();sim=state['players'][1]['id']
    sv=c.get(url+'?as_player='+sim,headers=headers(a)).json()
    r=c.post(url+'/action',headers=headers(a),json=dict(action='reroll',run=sv['run'],secret=sv['secret_id'],used=0,request_id='sim',as_player=sim))
    assert r.status_code==200 and r.json()['me']==sim and r.json()['rerolls_used']==1
    assert c.get(url,headers=headers(a)).json()['rerolls_used']==0
