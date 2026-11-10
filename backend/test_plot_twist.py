import copy
import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
import io
from fastapi import Header, HTTPException
from PIL import Image
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
def test_words_grow_only_for_the_writer_and_never_clash(lang):
    g,_=E.new_game('Host','trap',1,lang=lang)
    for i in range(1,8):E.add_player(g,f'Friend {i}')
    E.start(g);pool=set(E.AR_POOL if lang=='ar' else E.POOL)
    assert all(len(E.held(g,p['id']))==1 for p in g['players'])
    dealt=set(E.live(g))
    for n in range(40):
        writer=g['players'][g['turn']%8]['id']
        before={p['id']:list(E.held(g,p['id'])) for p in g['players']}
        send(g,'x x x x x')
        held=[w for p in g['players'] for w in E.held(g,p['id'])]
        # No duplicates in the game, every word from the language pool, never one dealt twice.
        assert len(held)==len(set(held)) and all(w in pool for w in held)
        new=set(held)-dealt
        assert len(new)==1 and dealt.isdisjoint(new);dealt|=new
        # The new word goes to whoever just wrote, on top of what they had; nobody else changes.
        assert E.held(g,writer)==before[writer]+list(new)
        assert all(E.held(g,p['id'])==before[p['id']] for p in g['players'] if p['id']!=writer)
    assert g['status']=='active'

@pytest.mark.parametrize('lang',['en','ar'])
def test_secret_words_have_no_shared_category(lang):
    # Words come from the whole everyday pool, so nobody can guess a theme and dodge it.
    seen=set()
    for _ in range(60):
        g,_=E.new_game('Host','trap',1,lang=lang)
        for i in range(1,8):E.add_player(g,f'Friend {i}')
        E.start(g)
        assert E.pool(g) is (E.AR_POOL if lang=='ar' else E.POOL) and 'category' not in g
        first=[E.held(g,p['id'])[0] for p in g['players']]
        assert len(set(first))==8
        seen|=set(first)
    # 480 random first words from one ~30-word theme would repeat constantly; the open pool barely does.
    assert len(seen)>(150 if lang=='ar' else 250)
    v=E.view(g,g['players'][0]['id'])
    assert 'category' not in v and 'category' not in json.dumps(v)

def test_words_private_and_old_category_rooms_play_on():
    g=game('trap',3);a,b,c=[p['id'] for p in g['players']]
    v=E.view(g,a)
    assert v['words']==E.held(g,a)
    raw=json.dumps(E.view(g,b))
    assert all(w not in raw for w in E.held(g,a))
    # A room saved while categories existed: the old field is ignored, then dropped on replay.
    g['category']='water';assert 'category' not in E.view(g,a)
    send(g,'one two three four five');assert len(E.held(g,a))==2
    E.end(g);E.start(g);assert 'category' not in g and all(len(E.held(g,p))==1 for p in (a,b,c))

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
    assert 'category' not in E.view(g,a) and all(w in E.AR_POOL for w in E.held(g,a))
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
    g['targets'][b]='piano';g['secrets']={}
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
    def delete(self):self.op='delete';return self
    def execute(self):
        if self.op=='insert':
            if self.body['code'] in self.db.rows:raise ValueError('duplicate key value violates unique constraint (23505)')
            self.db.rows[self.body['code']]=copy.deepcopy(self.body);return Result([self.body])
        rows=[r for r in self.db.rows.values() if all(r.get(k)==v for k,v in self.filters.items())]
        if self.op=='delete':
            for r in rows:del self.db.rows[r['code']]
        if self.op=='update':
            for r in rows:r.update(copy.deepcopy(self.body))
        return Result(copy.deepcopy(rows[0] if rows else None) if self.single else copy.deepcopy(rows))

ADMIN={'X-Admin-Token':'let-me-in'}
def require_admin(x_admin_token: str = Header(default=None, alias='X-Admin-Token')):
    if x_admin_token!='let-me-in':raise HTTPException(401,'Unauthorized')
    return True

@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','test-only-key');db=DB()
    async def query(fn):return fn()
    app=FastAPI();app.include_router(router(lambda:db,query,require_admin))
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
    assert 'category' not in av and 'category' not in bv
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


# ------------------------------------------------------------------ avatars

def test_avatars_unique_stable_and_shared_by_every_view():
    g=game('trap',8);ids=[p['id'] for p in g['players']]
    slots=[p['avatar'] for p in g['players']]
    assert len(set(slots))==8 and all(1<=n<=E.AVATARS for n in slots)
    def seen():return [[p['avatar'] for p in E.view(g,pid)['players']] for pid in ids]
    assert all(v==slots for v in seen())
    for _ in range(10):send(g,'one two three four five')
    E.set_style(g,ids[1],'teal','mint')
    assert all(v==slots for v in seen())
    E.end(g);E.start(g);assert all(v==slots for v in seen())

def test_avatars_spread_over_all_twenty_slots():
    used=set()
    for _ in range(40):
        g,_=E.new_game('Host','story',1)
        E.add_player(g,'Guest');used|={p['avatar'] for p in g['players']}
    assert used==set(range(1,E.AVATARS+1))

def test_rooms_from_before_avatars_get_stable_ones():
    g,_=E.new_game('Host','trap',0);E.add_player(g,'Guest')
    for p in g['players']:del p['avatar']
    first=[p['avatar'] for p in E.view(g,g['players'][0]['id'])['players']]
    assert first==[1,2] and [p['avatar'] for p in E.view(g,g['players'][1]['id'])['players']]==first
    p=E.add_player(g,'Late');assert p['avatar'] not in (1,2)

def picture(size=(300,200),mode='RGB',fmt='PNG',color=(200,40,90)):
    b=io.BytesIO();Image.new(mode,size,color).save(b,fmt);return b.getvalue()

def upload(c,slot,data,headers=ADMIN,name='me.png'):
    return c.put(f'/api/plot-twist/avatars/{slot}',files={'file':(name,data,'image/png')},headers=headers)

def test_avatar_slots_upload_replace_clear(client):
    c,db=client;url='/api/plot-twist/avatars'
    r=c.get(url);assert r.status_code==200 and r.json()=={'count':20,'slots':[None]*20}
    assert upload(c,3,picture(),headers={}).status_code==401
    assert upload(c,3,picture(),headers={'X-Admin-Token':'nope'}).status_code==401
    assert c.delete(url+'/3').status_code==401
    r=upload(c,3,picture());assert r.status_code==200
    first=r.json()['slots'][2];assert first and r.json()['slots'][:2]==[None,None]
    assert c.get(url).json()['slots'][2]==first
    img=c.get(f'{url}/{first}.webp');assert img.status_code==200 and img.headers['content-type']=='image/webp'
    assert 'immutable' in img.headers['cache-control']
    pic=Image.open(io.BytesIO(img.content));assert pic.format=='WEBP' and pic.size==(256,256)
    # Replacing the slot gets a new address and the old picture is removed.
    second=upload(c,3,picture(color=(10,120,90))).json()['slots'][2]
    assert second!=first and c.get(f'{url}/{first}.webp').status_code==404 and c.get(f'{url}/{second}.webp').status_code==200
    # The same picture in two slots is stored once and survives clearing one of them.
    assert upload(c,20,picture(color=(10,120,90))).json()['slots'][19]==second
    assert c.delete(url+'/3',headers=ADMIN).json()['slots'][2] is None
    assert c.get(f'{url}/{second}.webp').status_code==200
    assert c.delete(url+'/20',headers=ADMIN).json()['slots']==[None]*20
    assert c.get(f'{url}/{second}.webp').status_code==404
    assert not [k for k in db.rows if k.startswith('ptavatar:')]

def test_avatar_upload_checks(client):
    c,_=client
    for slot in (0,21):assert upload(c,slot,picture()).status_code==404
    assert upload(c,1,b'not a picture').status_code==400
    assert upload(c,1,b'').status_code==400
    assert upload(c,1,picture(size=(40,40))).status_code==400
    gif=picture(fmt='GIF',mode='P',color=1);assert upload(c,1,gif,name='x.gif').status_code==400
    # Transparent PNGs and phone JPEGs both come out as square WebP.
    for data in (picture(size=(900,400),mode='RGBA',color=(0,0,0,0)),picture(size=(400,900),fmt='JPEG')):
        r=upload(c,2,data);assert r.status_code==200
        pic=Image.open(io.BytesIO(c.get(f"/api/plot-twist/avatars/{r.json()['slots'][1]}.webp").content))
        assert pic.size==(256,256)
    for bad in ('nothex','ABCDEF0123456789abcd','0'*19,'../../etc/passwd'):
        assert c.get(f'/api/plot-twist/avatars/{bad}.webp').status_code==404

def test_avatar_admin_closed_without_admin_check(monkeypatch):
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY','test-only-key');db=DB()
    async def query(fn):return fn()
    app=FastAPI();app.include_router(router(lambda:db,query))
    with TestClient(app) as c:
        assert upload(c,1,picture()).status_code==401
        assert c.get('/api/plot-twist/avatars').json()['slots']==[None]*20

def test_room_views_carry_avatars(client):
    c,_=client;a=create(c);url='/api/plot-twist/rooms/'+a['code']
    b=c.post(url+'/join',json={'nickname':'Guest'}).json()
    av=c.get(url,headers=headers(a)).json();bv=c.get(url,headers=headers(b)).json()
    assert [p['avatar'] for p in av['players']]==[p['avatar'] for p in bv['players']]
    assert len({p['avatar'] for p in av['players']})==2
