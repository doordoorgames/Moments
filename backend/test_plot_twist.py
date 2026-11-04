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
    g['targets']={a:['pancake'],b:['ice'],c:['cake']};g['used']=list(set(g['used']+['pancake','ice','cake','piano']))
    send(g,'Pancake pancakes nice icing cupcake cakes iceman')
    assert not g['traps']
    g['targets']={a:['pancake'],b:['piano'],c:['ice']}
    send(g,'She said “PANCAKE!” then grabbed some ICE.')
    assert g['players'][0]['score']==1 and g['players'][2]['score']==1
    assert len(g['traps'])==2
    assert 'pancake' not in g['targets'][a] and 'ice' not in g['targets'][c]
    assert len(set(E.live(g)))==sum(len(E.held(g,p)) for p in (a,b,c))

@pytest.mark.parametrize('n',[5,9,15])
def test_trap_range(n):
    g=game('trap');send(g,' '.join(['word']*n));assert g['turn']==1

@pytest.mark.parametrize('lang',['en','ar'])
def test_category_words_grow_and_never_clash(lang):
    g,_=E.new_game('Host','trap',1,lang=lang)
    for i in range(1,8):E.add_player(g,f'Friend {i}')
    E.start(g);cat=E.CATS.BY_ID[g['category']][lang]['words']
    assert all(len(E.held(g,p['id']))==1 for p in g['players'])
    for n in range(40):
        writer=g['players'][g['turn']%8]['id'];before=len(E.held(g,writer))
        send(g,'x x x x x')
        held=[w for p in g['players'] for w in E.held(g,p['id'])]
        assert len(held)==len(set(held)) and all(w in cat for w in held)
        if n<8:assert len(E.held(g,writer))==before+1
    assert g['status']=='active'

def test_category_shared_words_private_replay_new_category():
    g=game('trap',3);a,b,c=[p['id'] for p in g['players']]
    v=E.view(g,a);name=E.CATS.BY_ID[g['category']]['en']['name']
    assert v['category']=={'id':g['category'],'name':name} and E.view(g,b)['category']==v['category']
    assert v['words']==E.held(g,a)
    raw=json.dumps(E.view(g,b))
    assert all(w not in raw for w in E.held(g,a))
    first=g['category'];E.end(g);E.start(g);assert g['category']!=first
    assert E.view(game('story'),a)['category'] is None

def test_writer_gains_word_and_trap_scores_any_held_word():
    g=game('trap',2);a,b=[p['id'] for p in g['players']]
    send(g,'one two three four five');assert len(E.held(g,a))==2
    second=E.held(g,a)[1]
    send(g,f'one two three four {second}')
    assert g['players'][0]['score']==1 and second not in E.held(g,a) and len(E.held(g,a))==2
    assert len(E.held(g,b))==2

def test_styles():
    g=game('trap',2);a,b=[p['id'] for p in g['players']]
    assert E.view(g,a)['players'][1]['style']=={'ink':E.INKS[1],'mark':'none'}
    E.set_style(g,b,'teal','mint');E.set_style(g,b,'rose','butter')
    assert E.view(g,a)['players'][1]['style']=={'ink':'rose','mark':'butter'}
    with pytest.raises(E.GameError):E.set_style(g,a,'gold','mint')
    with pytest.raises(E.GameError):E.set_style(g,a,'rose','glitter')

def test_arabic_matching_and_language():
    g,_=E.new_game('خالد','trap',1,lang='ar');E.add_player(g,'سعود');E.start(g)
    a,b=[p['id'] for p in g['players']]
    assert E.view(g,a)['lang']=='ar' and E.view(g,a)['min_words']==5 and E.view(g,a)['max_words']==15
    assert E.view(g,a)['category']['name']==E.CATS.BY_ID[g['category']]['ar']['name']
    g['targets'][b]=['قطة']
    send(g,'وفجأة طلعت القطّة من الشباك وركضت')
    assert g['players'][1]['score']==1
    g['targets'][a]=['مكيف']
    send(g,'شغلوا المكيفات لأن الجو حر')
    assert g['players'][0]['score']==0
    with pytest.raises(E.GameError) as e:send(g,'كلمة')
    assert e.value.text('ar').startswith('اكتب')
    with pytest.raises(E.GameError):E.new_game('x','trap',1,lang='fr')

def test_legacy_string_target_room():
    g=game('trap',2);a,b=[p['id'] for p in g['players']]
    g['targets'][b]='piano';g['category']=None;g['secrets']={}
    send(g,'one two three four piano')
    assert g['players'][1]['score']==1 and 'piano' not in E.held(g,b)

def test_views_capacity():
    g=game('trap',8);pid=g['players'][0]['id'];v=E.view(g,pid);raw=json.dumps(v)
    assert v['target']==E.held(g,pid)[0] and 'targets' not in v and 'used' not in v
    for p in g['players']:
        assert p['token'] not in raw
        if p['id']!=pid:assert all(w not in raw for w in E.held(g,p['id']))
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

def swap(g,pid,request=None,used=None,secret=None,word=''):
    v=E.view(g,pid)
    E.reroll(g,pid,v['secret_id'] if secret is None else secret,v['rerolls_used'] if used is None else used,request or f"r{v['rerolls_used']}:{v['target']}",word)

@pytest.mark.parametrize('lang',['en','ar'])
def test_reroll_once_then_locked(lang):
    g,_=E.new_game('Host','trap',0,lang=lang);E.add_player(g,'Guest');E.start(g)
    a,b=[p['id'] for p in g['players']];other=E.held(g,b)
    first=E.held(g,a)[0]
    assert E.view(g,a)['rerolls_used']==0 and E.view(g,a)['rerolls_max']==1
    swap(g,a);v=E.view(g,a)
    assert v['rerolls_used']==1 and v['target']!=first and v['target'] not in other and v['target'] in E.pool(g)
    before=copy.deepcopy(g)
    with pytest.raises(E.GameError):swap(g,a)
    assert g==before
    assert E.held(g,b)==other and E.view(g,b)['rerolls_used']==0
    swap(g,b);assert E.view(g,b)['rerolls_used']==1

def test_reroll_picks_word_and_stays_spent_after_trap():
    g=game('trap',2);a,b=[p['id'] for p in g['players']]
    send(g,'one two three four five');second=E.held(g,a)[1]
    send(g,'one two three four five')
    swap(g,a,word=second);assert second not in E.held(g,a) and len(E.held(g,a))==2
    with pytest.raises(E.GameError):swap(g,b,word='notmine')
    assert E.view(g,b)['rerolls_used']==0
    send(g,'one two three four five')
    send(g,f'one two three four {E.held(g,a)[0]}')
    assert g['players'][0]['score']==1 and E.view(g,a)['rerolls_used']==1

def test_reroll_duplicate_and_double_tap():
    g=game('trap');a=g['players'][0]['id']
    v=E.view(g,a)
    E.reroll(g,a,v['secret_id'],0,'tap-1');words=E.held(g,a);version=g['version']
    E.reroll(g,a,v['secret_id'],0,'tap-1')
    assert E.held(g,a)==words and E.view(g,a)['rerolls_used']==1 and g['version']==version
    with pytest.raises(E.GameError):E.reroll(g,a,v['secret_id'],0,'tap-2')
    assert E.held(g,a)==words

def test_reroll_failure_keeps_word_and_count():
    g=game('trap');a=g['players'][0]['id'];words=E.held(g,a)
    with pytest.raises(E.GameError):E.reroll(g,a,'not-this-assignment',0,'x')
    with pytest.raises(E.GameError):E.reroll(g,a,E.view(g,a)['secret_id'],0,'')
    assert E.held(g,a)==words and E.view(g,a)['rerolls_used']==0

def test_reroll_only_during_active_trap_and_replay_resets():
    g=game('story');a=g['players'][0]['id']
    with pytest.raises(E.GameError):E.reroll(g,a,'',0,'s')
    g=game('trap');a=g['players'][0]['id']
    swap(g,a);E.end(g)
    with pytest.raises(E.GameError):swap(g,a)
    E.start(g);assert E.view(g,a)['rerolls_used']==0

def test_reroll_view_is_private():
    g=game('trap',3);a,b,c=[p['id'] for p in g['players']]
    first=E.held(g,a)[0];swap(g,a)
    for pid in (b,c):
        raw=json.dumps(E.view(g,pid))
        assert first not in raw and E.held(g,a)[0] not in raw and 'secrets' not in raw and 'seen' not in raw

def test_reroll_legacy_room_without_allowances():
    g=game('trap');a=g['players'][0]['id'];del g['secrets']
    v=E.view(g,a);assert v['rerolls_used']==0
    E.reroll(g,a,v['secret_id'],0,'legacy');assert E.view(g,a)['rerolls_used']==1

def test_http_reroll_and_style(client):
    c,db=client;a=create(c);url='/api/plot-twist/rooms/'+a['code'];b=c.post(url+'/join',json={'nickname':'Guest'}).json()
    av=c.post(url+'/action',json={'action':'start'},headers=headers(a)).json();bv=c.get(url,headers=headers(b)).json()
    assert av['category'] and av['category']==bv['category']
    def go(p,v,rid,**kw):
        return c.post(url+'/action',headers=headers(p),json=dict(action='reroll',run=v['run'],secret=v['secret_id'],used=v['rerolls_used'],request_id=rid,**kw))
    old=av['target'];r=go(a,av,'a1',word=old);assert r.status_code==200
    av=r.json();assert av['rerolls_used']==1 and old not in av['words']
    assert go(a,av,'a2').status_code==400
    again=c.get(url,headers=headers(a)).json();assert again['words']==av['words']
    assert av['target'] not in json.dumps(db.rows)
    bv=c.get(url,headers=headers(b)).json();assert bv['rerolls_used']==0 and av['target'] not in json.dumps(bv)
    r=c.post(url+'/action',headers=headers(b),json=dict(action='style',ink='teal',mark='mint'))
    assert r.status_code==200 and r.json()['players'][1]['style']=={'ink':'teal','mark':'mint'}
    assert c.post(url+'/action',headers=headers(b),json=dict(action='style',ink='x',mark='mint')).status_code==400
    assert c.post(url+'/action',headers={'Authorization':'Bearer x:y'},json=dict(action='reroll',run=bv['run'],request_id='z')).status_code==403

def test_http_reroll_developer_seat(client):
    c,_=client;a=create(c,dev=True);url='/api/plot-twist/rooms/'+a['code']
    c.post(url+'/action',json={'action':'add_test'},headers=headers(a))
    state=c.post(url+'/action',json={'action':'start'},headers=headers(a)).json();sim=state['players'][1]['id']
    sv=c.get(url+'?as_player='+sim,headers=headers(a)).json()
    r=c.post(url+'/action',headers=headers(a),json=dict(action='reroll',run=sv['run'],secret=sv['secret_id'],used=0,request_id='sim',as_player=sim))
    assert r.status_code==200 and r.json()['me']==sim and r.json()['rerolls_used']==1
    assert c.get(url,headers=headers(a)).json()['rerolls_used']==0
