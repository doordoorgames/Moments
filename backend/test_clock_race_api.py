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


def test_race_over_http(client, monkeypatch):
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
    # A wrong answer moves the player on as a miss; it never becomes right.
    tasks = state['round']['tasks']
    clock = [E.time.time() + 10]
    monkeypatch.setattr(E.time, 'time', lambda: clock[0])
    host_r = c.post(url + '/answer', json={'round': rid, 'task': 0, 'answer': 'nope'}, headers=h(host)).json()
    assert host_r['right'] is False and host_r['done'] == 1
    # Play the guest to the end with right answers (moving the clock past the memory grids).
    for i in range(20):
        clock[0] += 10
        value = guest['player_id'] if tasks[i]['type'] == 'vote' else E.solve(tasks[i], [p['id'] for p in state['roster']])
        r = c.post(url + '/answer', json={'round': rid, 'task': i, 'answer': value}, headers=h(guest)).json()
        assert r['right'] and r['done'] == i + 1, (i, tasks[i]['type'], r)
    assert r['state']['status'] == 'finished' and r['state']['winner'] == guest['player_id']
    assert 'token' not in str(r['state'])
    final = {p['id']: p for p in r['state']['players']}
    assert final[guest['player_id']]['right'] == 20 and final[host['player_id']]['right'] == 0


def test_dev_only_in_test99(client):
    c, _ = client
    normal = c.post('/api/clock-race/rooms', json={'nickname': 'Khaled'}).json()
    assert len(normal['state']['players']) == 1                              # no bot in normal rooms
    assert c.post(f"/api/clock-race/rooms/{normal['code']}/dev", json={'action': 'add', 'count': 3}, headers=h(normal)).status_code == 403
    dev = c.post('/api/clock-race/rooms', json={'nickname': 'test99'}).json()
    url = f"/api/clock-race/rooms/{dev['code']}"
    s = c.post(url + '/dev', json={'action': 'add', 'count': 10}, headers=h(dev)).json()
    assert len(s['players']) == 12
    assert c.post(url + '/join', json={'nickname': 'late'}).status_code == 400
    c.post(url + '/start', json={'round': ''}, headers=h(dev))
    s = c.post(url + '/dev', json={'action': 'solve'}, headers=h(dev)).json()
    assert [p['done'] for p in s['players'] if p['id'] == dev['player_id']] == [1]
    assert s['timing']


def test_test99_one_phone_race_with_test_bot(client, monkeypatch):
    c, _ = client
    clock = [5000.0]
    monkeypatch.setattr(E.time, 'time', lambda: clock[0])
    room = c.post('/api/clock-race/rooms', json={'nickname': 'TeSt99'}).json()
    url = f"/api/clock-race/rooms/{room['code']}"
    lobby = room['state']
    assert [(p['name'], p['bot']) for p in lobby['players']] == [('TeSt99', False), ('Test Bot', True)]
    assert lobby['status'] == 'lobby'
    s = c.post(url + '/start', json={'round': ''}, headers=h(room)).json()
    assert s['status'] == 'racing' and len(s['roster']) == 2
    bot = lobby['players'][1]['id']
    done = lambda st: {p['id']: p['done'] for p in st['players']}[bot]
    assert done(c.get(url, headers=h(room)).json()) == 0
    clock[0] += 30                                                            # host's phone asleep for 30s
    mid = done(c.get(url, headers=h(room)).json())
    assert 1 <= mid <= 15
    clock[0] += 400
    end = c.get(url, headers=h(room)).json()
    assert end['status'] == 'finished' and end['winner'] == bot and done(end) == 20
    assert c.post(url + '/start', json={'round': end['round']['id']}, headers=h(room)).json()['status'] == 'racing'


def test_bad_codes(client):
    c, _ = client
    assert c.get('/api/clock-race/rooms/12', headers={}).status_code == 400
    assert c.get('/api/clock-race/rooms/12345', headers={}).status_code == 404
