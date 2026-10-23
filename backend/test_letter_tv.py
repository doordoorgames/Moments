import copy
import json
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
import letter_tv as E
from letter_tv_api import router


def test_pairs_are_uppercase_and_never_repeat_the_previous_pair():
    g, _ = E.new_room()
    assert g['pair'] is None and g['seq'] == 0
    prev = None
    for n in range(500):
        assert E.press(g, n)
        assert all(len(x) == 1 and 'A' <= x <= 'Z' for x in g['pair'])
        assert g['pair'] != prev
        prev = list(g['pair'])


def test_forced_repeat_is_rerolled():
    seq = iter('ABABCD')
    assert E.new_pair('en', ['A', 'B'], rng=lambda _: next(seq)) == ['C', 'D']


def test_duplicate_and_stale_presses_change_nothing():
    g, _ = E.new_room()
    assert E.press(g, 0)
    before = copy.deepcopy(g)
    assert not E.press(g, 0)   # second tap of the same press
    assert not E.press(g, 5)   # nonsense
    assert g == before


def test_only_english_for_now():
    with pytest.raises(E.GameError):
        E.new_room('ar')


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
            self.db.rows[self.body['code']] = copy.deepcopy(self.body); return Result([self.body])
        rows = [r for r in self.db.rows.values() if all(r.get(k) == v for k, v in self.filters.items())]
        if self.op == 'update':
            for r in rows: r.update(copy.deepcopy(self.body))
        return Result(copy.deepcopy(rows[0] if rows else None) if self.single else copy.deepcopy(rows))


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-key'); db = DB()
    async def query(fn): return fn()
    app = FastAPI(); app.include_router(router(lambda: db, query))
    with TestClient(app) as c: yield c, db


def h(s): return {'Authorization': f"Bearer {s['id']}:{s['token']}"}


def test_room_host_drives_everyone_sees_same_pair(client):
    c, db = client
    host = c.post('/api/letter-tv/rooms', json={}).json()
    url = '/api/letter-tv/rooms/' + host['code']
    assert host['state'] == {'lang': 'en', 'pair': None, 'seq': 0, 'host': True}
    guest = c.post(url + '/join').json()
    assert guest['state']['host'] is False and guest['state']['pair'] is None
    # Guests cannot press, and nobody without a session can read the room.
    assert c.post(url + '/next', json={'seq': 0}, headers=h(guest)).status_code == 403
    assert c.get(url).status_code == 403
    with c.websocket_connect(url + '/live') as ws:
        ws.send_json({'authorization': h(guest)['Authorization']}); assert ws.receive_json() == {'type': 'refresh'}
        r = c.post(url + '/next', json={'seq': 0}, headers=h(host)).json()
        assert ws.receive_json() == {'type': 'refresh'}
    assert r['seq'] == 1 and len(r['pair']) == 2
    assert c.get(url, headers=h(guest)).json()['pair'] == r['pair']
    # A double tap (still says seq 0) does not skip a pair.
    again = c.post(url + '/next', json={'seq': 0}, headers=h(host)).json()
    assert again['seq'] == 1 and again['pair'] == r['pair']
    # A late joiner gets the current pair straight away.
    late = c.post(url + '/join').json()
    assert late['state']['pair'] == r['pair'] and late['state']['seq'] == 1
    # Host token never stored in the clear.
    assert host['token'] not in json.dumps(db.rows)


def test_bad_codes(client):
    c, _ = client
    assert c.post('/api/letter-tv/rooms/ABCDE/join').status_code == 400
    assert c.post('/api/letter-tv/rooms/00000/join').status_code in (400, 404)
