"""Clock Race studio over HTTP: sign-in, editing, approval, publishing, uploads, and the live game."""
import copy
import io

import pytest

pytest.importorskip('fastapi')
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

import clock_race as E  # noqa: E402
import clock_race_admin_api as S  # noqa: E402
import clock_race_content as C  # noqa: E402
from clock_race_api import router as game_router  # noqa: E402


class Result:
    def __init__(self, data): self.data = data


class DB:
    def __init__(self): self.rows = {}
    def table(self, _): return Query(self)


class Query:
    def __init__(self, db): self.db = db; self.filters = {}; self.op = 'select'; self.body = None; self.single = False
    def select(self, *_): return self
    def eq(self, k, v): self.filters[k] = v; return self
    def maybe_single(self): self.single = True; return self
    def insert(self, data): self.op = 'insert'; self.body = data; return self
    def update(self, data): self.op = 'update'; self.body = data; return self

    def execute(self):
        if self.op == 'insert':
            if self.body['code'] in self.db.rows:
                raise RuntimeError('duplicate key')
            self.db.rows[self.body['code']] = copy.deepcopy(self.body)
            return Result([self.body])
        rows = [r for r in self.db.rows.values() if all(r.get(k) == v for k, v in self.filters.items())]
        if self.op == 'update':
            for r in rows:
                r.update(copy.deepcopy(self.body))
        return Result(copy.deepcopy(rows[0] if rows else None) if self.single else copy.deepcopy(rows))


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-key')
    monkeypatch.setenv('CLOCK_RACE_ADMINS', 'khaled:correct-horse-battery')
    monkeypatch.delenv('CLOCK_RACE_ADMIN_SECRET', raising=False)
    monkeypatch.setattr(E, 'COUNTDOWN', 0.0)
    monkeypatch.setattr(S, '_limiter', S.auth.Limiter())
    S._refresh['at'] = 0.0
    C.LIVE.load(C.empty_state())
    db = DB()

    async def query(fn):
        try:
            return fn()
        except RuntimeError as exc:
            from fastapi import HTTPException
            raise HTTPException(502, str(exc))
    app = FastAPI()
    api, public = S.router(lambda: db, query)
    app.include_router(api)
    app.include_router(public)
    app.include_router(game_router(lambda: db, query))
    with TestClient(app) as c:
        yield c, db
    C.LIVE.load(C.empty_state())


def sign_in(c):
    r = c.post('/api/admin/clock-race/login', json={'password': 'correct-horse-battery'})
    assert r.status_code == 200, r.text
    return {'Authorization': 'Bearer ' + r.json()['token']}


def png(size=(1000, 800)):
    img = Image.new('RGB', size)
    px = img.load()
    for x in range(0, size[0]):
        for y in range(0, size[1]):
            px[x, y] = ((x * 5) % 256, (y * 9) % 256, ((x + y) * 3) % 256)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


def test_everything_needs_a_signed_in_admin(client):
    c, _ = client
    for method, path in [('get', '/library'), ('get', '/items/b01'), ('put', '/items/b01'), ('post', '/publish'),
                         ('get', '/assets'), ('post', '/bulk-approve'), ('post', '/items/b01/status')]:
        r = c.request(method.upper(), '/api/admin/clock-race' + path, json={}, headers={'Authorization': 'Bearer forged.token'})
        assert r.status_code in (401, 422), (path, r.status_code)
        r = c.request(method.upper(), '/api/admin/clock-race' + path, json={})
        assert r.status_code in (401, 422), (path, r.status_code)
    assert c.post('/api/admin/clock-race/login', json={'password': 'admin123'}).status_code == 401


def test_initial_password_when_no_server_password(client, monkeypatch):
    c, _ = client
    monkeypatch.delenv('CLOCK_RACE_ADMINS')
    r = c.post('/api/admin/clock-race/login', json={'password': 'admin123'})
    assert r.status_code == 200 and 'admin123' not in r.text
    assert c.post('/api/admin/clock-race/login', json={'password': 'wrong'}).status_code == 401


def test_library_lists_every_question(client):
    c, _ = client
    h = sign_in(c)
    lib = c.get('/api/admin/clock-race/library', headers=h).json()
    assert lib['counts']['total'] == len(C.builtin())
    assert {r['type'] for r in lib['items']} == set(C.EDITABLE_TYPES)
    assert lib['counts']['needs_review'] == lib['counts']['total'] and lib['counts']['legacy'] == lib['counts']['total']


def test_edit_approve_publish_revert(client):
    c, db = client
    h = sign_in(c)
    item = c.get('/api/admin/clock-race/items/w01', headers=h).json()
    data = dict(item['draft'], en='Which is quicker?')
    saved = c.put('/api/admin/clock-race/items/w01', json={'data': data, 'base': item['updated_at']}, headers=h).json()
    assert saved['status'] == 'draft' and saved['updated_by'] == 'khaled' and saved['live'] == 'legacy'
    # a second editor working from the old version is stopped
    stale = c.put('/api/admin/clock-race/items/w01', json={'data': data, 'base': 'old'}, headers=h)
    assert stale.status_code == 400 and 'changed this question' in stale.json()['detail']
    ok = c.post('/api/admin/clock-race/items/w01/status', json={'status': 'approved'}, headers=h).json()
    assert ok['approved_by'] == 'khaled'
    pend = c.get('/api/admin/clock-race/pending', headers=h).json()
    assert [p['id'] for p in pend['changes']] == ['w01']
    assert c.post('/api/admin/clock-race/publish', json={'rev': pend['rev'] + 5}, headers=h).status_code == 400
    pub = c.post('/api/admin/clock-race/publish', json={'rev': pend['rev']}, headers=h).json()
    assert pub['by'] == 'khaled'
    assert {x['id']: x for x in C.picture_bank('which')}['w01']['en'] == 'Which is quicker?'
    # persisted: a fresh server process sees it
    C.LIVE.load(C.empty_state())
    S._refresh['at'] = 0
    import asyncio
    asyncio.run(S.refresh_live(force=True))
    assert {x['id']: x for x in C.picture_bank('which')}['w01']['en'] == 'Which is quicker?'
    c.post(f'/api/admin/clock-race/publish/{pub["rev"]}/revert', headers=h).raise_for_status()
    assert {x['id']: x for x in C.picture_bank('which')}['w01']['en'] != 'Which is quicker?'


def test_bulk_approve_skips_broken(client):
    c, _ = client
    h = sign_in(c)
    item = c.get('/api/admin/clock-race/items/b05', headers=h).json()
    c.put('/api/admin/clock-race/items/b05', json={'data': dict(item['draft'], ar='')}, headers=h).raise_for_status()
    r = c.post('/api/admin/clock-race/bulk-approve', json={'ids': ['b01', 'b02', 'b05']}, headers=h).json()
    assert r['approved'] == ['b01', 'b02'] and r['skipped'][0]['id'] == 'b05'


def test_upload_new_puzzle_and_play_it(client):
    c, db = client
    h = sign_in(c)
    up = c.post('/api/admin/clock-race/assets', headers=h,
                files=[('files', ('fuji.png', png(), 'image/png')), ('files', ('bad.txt', b'hello', 'text/plain'))],
                data={'source': 'Own photo', 'license': 'Owned'}).json()
    assert len(up['saved']) == 1 and up['failed'][0]['name'] == 'bad.txt'
    ref = up['saved'][0]['ref']
    assert up['saved'][0]['credit'] == {'source': 'Own photo', 'license': 'Owned'}
    # served from the database fallback (the fake has no storage)
    pic = c.get(up['saved'][0]['url'])
    assert pic.status_code == 200 and pic.headers['content-type'] == 'image/webp'
    assert c.get(up['saved'][0]['original']).content == png()
    new = c.post('/api/admin/clock-race/items', json={'type': 'tile', 'data': {'title': 'Fuji'}}, headers=h).json()
    tid = new['id']
    r = c.post(f'/api/admin/clock-race/items/{tid}/tile', json={'source': ref, 'crop': {'x': 100, 'y': 0, 'size': 800}}, headers=h)
    assert r.status_code == 200, r.text
    t = r.json()
    assert t['draft']['crop'] == {'x': 100, 'y': 0, 'size': 800}
    assert len(t['draft']['opts']) == 4 and not [p for p in t['problems'] if p['level'] == 'error'], t['problems']
    puzzle = Image.open(io.BytesIO(c.get(t['refs'][t['draft']['rendered']['img']]['url']).content))
    assert puzzle.size == (900, 900)
    before = t['draft']['opts']
    regen = c.post(f'/api/admin/clock-race/items/{tid}/tile', json={'regenerate': True}, headers=h).json()
    assert len(regen['draft']['opts']) == 4 and regen['draft']['rendered']['img'] == t['draft']['rendered']['img']
    assert before is not None
    prev = c.get(f'/api/admin/clock-race/items/{tid}/preview', headers=h).json()
    assert prev['type'] == 'tile' and prev['img'].startswith('/api/clock-race/asset/') and prev['opts'][prev['answer']][0] == 'none'
    c.post(f'/api/admin/clock-race/items/{tid}/status', json={'status': 'approved'}, headers=h).raise_for_status()
    rev = c.get('/api/admin/clock-race/pending', headers=h).json()['rev']
    c.post('/api/admin/clock-race/publish', json={'rev': rev}, headers=h).raise_for_status()
    assert tid in C.tile_set()
    assert C.tile_set()[tid]['img'].startswith('/api/clock-race/asset/')


def test_rejected_question_out_of_a_real_round(client):
    c, db = client
    h = sign_in(c)
    for qid in [x['id'] for x in E.K.BY_KIND['compare']][:10]:
        c.post(f'/api/admin/clock-race/items/{qid}/status', json={'status': 'rejected'}, headers=h).raise_for_status()
    rev = c.get('/api/admin/clock-race/pending', headers=h).json()['rev']
    c.post('/api/admin/clock-race/publish', json={'rev': rev}, headers=h).raise_for_status()
    C.LIVE.load(C.empty_state())  # simulate another process: the round start must reload it
    S._refresh['at'] = 0
    banned = {x['id'] for x in E.K.BY_KIND['compare'][:10]}
    room = c.post('/api/clock-race/rooms', json={'nickname': 'Khaled', 'lang': 'en'}).json()
    auth = {'Authorization': f"Bearer {room['player_id']}:{room['token']}"}
    st = c.post(f"/api/clock-race/rooms/{room['code']}/start", json={'round': ''}, headers=auth)
    assert st.status_code == 200, st.text
    assert C.LIVE.rev == rev + 1 and len(C.LIVE.overrides) == 10  # the round start reloaded the published state
    for t in st.json()['round']['tasks']:
        assert t.get('qid') not in banned
    live_ids = {x['id'] for x in C.picture_bank('compare')}
    assert not live_ids & banned and len(live_ids) == len(E.K.BY_KIND['compare']) - 10


def test_admin_data_not_on_public_routes(client):
    c, _ = client
    assert c.get('/api/clock-race/asset/../../etc/passwd/x').status_code == 404
    assert c.get('/api/clock-race/asset/zzzz/player.webp').status_code == 404
    assert c.get('/api/clock-race/asset/abcdef12345678901234/secret.json').status_code == 404
