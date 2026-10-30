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
    db = DB()

    async def query(fn): return fn()
    app = FastAPI()
    app.include_router(router(lambda: db, query))
    with TestClient(app) as c:
        yield c, db


def h(s): return {'Authorization': f"Bearer {s['player_id']}:{s['token']}"}


def test_race_over_http(client):
    c, db = client
    host = c.post('/api/clock-race/rooms', json={'nickname': 'Khaled'}).json()
    url = '/api/clock-race/rooms/' + host['code']
    guest = c.post(url + '/join', json={'nickname': 'Khaled'}).json()          # duplicate nickname is fine
    assert c.post(url + '/start', json={'round': ''}, headers=h(guest)).status_code == 403
    state = c.post(url + '/start', json={'round': ''}, headers=h(host)).json()
    rid = state['round']['id']
    assert c.post(url + '/start', json={'round': ''}, headers=h(host)).json()['round']['id'] == rid
    assert len(state['round']['tasks']) == 20 and state['round']['tasks'][10]['type'] == 'vote'
    # The guest's view is the same round.
    assert c.get(url, headers=h(guest)).json()['round']['tasks'] == state['round']['tasks']
    # Wrong answer: nothing lost.
    r = c.post(url + '/answer', json={'round': rid, 'task': 0, 'answer': 'nope'}, headers=h(guest)).json()
    assert r['right'] is False and r['done'] == 0
    # The server knows the right answers; play the guest to the end through the engine's solver.
    for i in range(20):
        t = state['round']['tasks'][i]
        if t['type'] == 'word':
            value = E.solve(t, [p['id'] for p in state['roster']])
        elif t['type'] == 'vote':
            value = guest['player_id']                                           # voting for yourself works
        elif t['type'] == 'odd':
            value = t['odd']
        elif t['type'] == 'boss':
            value = t['faces'].index(t['answer'])
        else:
            value = t['answer']
        r = c.post(url + '/answer', json={'round': rid, 'task': i, 'answer': value}, headers=h(guest)).json()
        assert r['right'] and r['done'] == i + 1
    assert r['state']['status'] == 'finished' and r['state']['winner'] == guest['player_id']
    assert 'token' not in str(r['state'])


def test_dev_only_in_test99(client):
    c, _ = client
    normal = c.post('/api/clock-race/rooms', json={'nickname': 'Khaled'}).json()
    assert c.post(f"/api/clock-race/rooms/{normal['code']}/dev", json={'action': 'add', 'count': 3}, headers=h(normal)).status_code == 403
    dev = c.post('/api/clock-race/rooms', json={'nickname': 'test99'}).json()
    url = f"/api/clock-race/rooms/{dev['code']}"
    s = c.post(url + '/dev', json={'action': 'add', 'count': 11}, headers=h(dev)).json()
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
