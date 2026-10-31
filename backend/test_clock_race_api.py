import copy

import pytest

pytest.importorskip('fastapi')
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import clock_race as E  # noqa: E402
from clock_race_api import router  # noqa: E402


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
    monkeypatch.setattr(E, 'COUNTDOWN', 0.0)
    monkeypatch.setattr(E, 'WRONG_DELAY', 0.0)
    monkeypatch.setattr(E.D, 'MEMORY_SHOW', 0.0)
    db = DB()

    async def query(fn): return fn()
    app = FastAPI()
    app.include_router(router(lambda: db, query))
    with TestClient(app) as c:
        yield c, db


def h(s): return {'Authorization': f"Bearer {s['player_id']}:{s['token']}"}


def test_race_over_http(client):
    c, db = client
    host = c.post('/api/clock-race/rooms', json={'nickname': 'Khaled', 'lang': 'en'}).json()
    url = '/api/clock-race/rooms/' + host['code']
    guest = c.post(url + '/join', json={'nickname': 'Khaled'}).json()          # duplicate nickname is fine
    assert guest['state']['lang'] == 'en'                                        # joiners follow the room
    assert c.post(url + '/start', json={'round': ''}, headers=h(guest)).status_code == 403
    state = c.post(url + '/start', json={'round': ''}, headers=h(host)).json()
    rid = state['round']['id']
    assert c.post(url + '/start', json={'round': ''}, headers=h(host)).json()['round']['id'] == rid
    assert len(state['round']['tasks']) == E.TASKS and 'vote' not in [t['type'] for t in state['round']['tasks']]  # 2 people
    assert c.get(url, headers=h(guest)).json()['round']['tasks'] == state['round']['tasks']
    ids = [p['id'] for p in state['roster']]
    # first answer wrong: it still moves the guest on, and is recorded as wrong
    r = c.post(url + '/answer', json={'round': rid, 'task': 0, 'answer': 'nope'}, headers=h(guest)).json()
    assert r['right'] is False and r['done'] == 1
    again = c.post(url + '/answer', json={'round': rid, 'task': 0, 'answer': E.solve(state['round']['tasks'][0], ids)}, headers=h(guest)).json()
    assert again['right'] is False and again['done'] == 1                        # no second try
    for i in range(1, E.TASKS):
        t = state['round']['tasks'][i]
        value = E.solve(t, ids)
        r = c.post(url + '/answer', json={'round': rid, 'task': i, 'answer': value}, headers=h(guest)).json()
        assert r['right'] and r['done'] == i + 1
    assert r['state']['status'] == 'finished' and r['state']['winner'] == guest['player_id']
    me = [p for p in r['state']['players'] if p['id'] == guest['player_id']][0]
    assert me['done'] == E.TASKS and me['right'] == E.TASKS - 1
    assert 'token' not in str(r['state'])


def test_test99_bot_runs_on_the_server_clock(client, monkeypatch):
    c, _ = client
    dev = c.post('/api/clock-race/rooms', json={'nickname': 'test99'}).json()
    url = f"/api/clock-race/rooms/{dev['code']}"
    assert [p['name'] for p in dev['state']['players']] == ['test99', 'Test Bot']
    s = c.post(url + '/start', json={'round': ''}, headers=h(dev)).json()
    bot = s['players'][1]['id']
    assert len(s['bots'][bot]) == E.TASKS
    real = E.time.time
    monkeypatch.setattr(E.time, 'time', lambda: real() + 1000)                  # the phone slept; time went on
    v = c.get(url, headers=h(dev)).json()
    assert v['status'] == 'finished' and v['winner'] == bot
    assert [p['done'] for p in v['players'] if p['id'] == bot] == [E.TASKS]


def test_dev_only_in_test99(client):
    c, _ = client
    normal = c.post('/api/clock-race/rooms', json={'nickname': 'Khaled'}).json()
    assert c.post(f"/api/clock-race/rooms/{normal['code']}/dev", json={'action': 'add', 'count': 3}, headers=h(normal)).status_code == 403
    dev = c.post('/api/clock-race/rooms', json={'nickname': 'test99'}).json()
    url = f"/api/clock-race/rooms/{dev['code']}"
    assert c.post(url + '/dev', json={'action': 'bots'}, headers=h(dev)).status_code == 422   # removed
    s = c.post(url + '/dev', json={'action': 'add', 'count': 10}, headers=h(dev)).json()
    assert len(s['players']) == 12
    assert c.post(url + '/join', json={'nickname': 'late'}).status_code == 400
    c.post(url + '/start', json={'round': ''}, headers=h(dev))
    s = c.post(url + '/dev', json={'action': 'solve'}, headers=h(dev)).json()
    assert [p['done'] for p in s['players'] if p['id'] == dev['player_id']] == [1]
    assert s['timing']


def test_bad_codes(client):
    c, _ = client
    assert c.get('/api/clock-race/rooms/12', headers={}).status_code == 400
    assert c.get('/api/clock-race/rooms/12345', headers={}).status_code == 404
