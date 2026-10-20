import pytest
from fastapi import FastAPI, HTTPException, Header
from fastapi.testclient import TestClient

import emoji_rooftop as E
from emoji_rooftop_api import router


def test_seed_banks():
    for lang in ('en', 'ar'):
        bank = E.SEEDS[lang]
        assert len(bank) == 50 and all(c['emojis'] and c['answer'] for c in bank)
        assert E.parse_csv(E.to_csv(bank))[0] == bank
        assert len({E.normalize(c['answer']) for c in bank}) == 50
    assert E.SEED == E.SEEDS['en']


def test_csv_errors():
    clues, errors = E.parse_csv('category,emojis,answer\nMovie,,Jaws\nFood,🍕,Pizza')
    assert len(clues) == 1 and errors


def test_host_starts_alone_and_seats_have_no_names():
    g, host = E.new_game(5, 'ar')
    assert set(host) == {'id', 'token'}
    E.start(g, E.SEEDS['ar'], 100)
    assert g['status'] == 'active' and len(g['seats']) == 1
    for _ in range(E.MAX_SEATS - 1):
        E.add_seat(g)
    with pytest.raises(E.GameError) as e:
        E.add_seat(g)
    assert e.value.text('ar').startswith('السطح')
    with pytest.raises(E.GameError):
        E.new_game(5, 'fr')


def test_reveal_next_flow():
    g, host = E.new_game(3, 'en')
    viewer = E.add_seat(g)['id']
    E.start(g, E.SEED, 100)
    t0 = g['round_at']
    assert E.phase(g, t0 - 1) == 'intro' and 'clue' not in E.view(g, viewer, t0 - 1)
    with pytest.raises(E.GameError):
        E.reveal(g, t0 - 1)
    with pytest.raises(E.GameError):
        E.next_round(g, t0)  # must reveal first
    v = E.view(g, viewer, t0 + 5)
    assert v['phase'] == 'showing' and v['clue']['emojis'] and v['answer'] is None
    for i in range(3):
        now = t0 + 10 * (i + 1)
        E.reveal(g, now)
        v = E.view(g, viewer, now)
        assert v['phase'] == 'reveal' and v['round'] == i and v['answer'] == g['clues'][i]['answer']
        E.next_round(g, now)
    assert E.view(g, viewer, t0 + 100)['status'] == 'ended'
    E.start(g, E.SEED, 500, rounds=2)
    assert g['round'] == 0 and len(g['clues']) == 2


def test_unique_clues_and_round_cap():
    g, _ = E.new_game(50)
    E.start(g, E.SEED, 0)
    assert len({c['answer'] for c in g['clues']}) == 50
    g2, _ = E.new_game(5)
    E.start(g2, E.SEED[:3], 0)
    assert len(g2['clues']) == 3


# ---------------------------------------------------------------- API with a fake Supabase

class Result:
    def __init__(self, data):
        self.data = data


class Table:
    def __init__(self, rows):
        self.rows, self.filters, self.op, self.payload = rows, [], 'select', None

    def select(self, *_):
        self.op = 'select'; return self

    def eq(self, k, v):
        self.filters.append((k, v)); return self

    def maybe_single(self):
        return self

    def insert(self, d):
        self.op, self.payload = 'insert', d; return self

    def update(self, d):
        self.op, self.payload = 'update', d; return self

    def match(self, r):
        return all(r.get(k) == v for k, v in self.filters)

    def execute(self):
        if self.op == 'insert':
            self.rows.append(dict(self.payload)); return Result([self.payload])
        hits = [r for r in self.rows if self.match(r)]
        if self.op == 'update':
            for r in hits:
                r.update(self.payload)
            return Result(hits)
        return Result(hits[0] if hits else None)


class DB:
    def __init__(self):
        self.rows = []

    def table(self, _):
        return Table(self.rows)


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv('SUPABASE_KEY', 'test-key')
    db, clock = DB(), {'t': 5000.0}

    async def query(fn):
        return fn()

    def admin(x_admin_token: str = Header(default='')):
        if x_admin_token != 'ok':
            raise HTTPException(401, 'no')
        return True

    app = FastAPI()
    app.include_router(router(lambda: db, query, admin, clock=lambda: clock['t']))
    return TestClient(app), clock, db


def bearer(r):
    return {'Authorization': f"Bearer {r['player_id']}:{r['token']}"}


def test_api_full_game(api):
    client, clock, db = api
    host = client.post('/api/emoji-rooftop/rooms', json={'rounds': 5, 'lang': 'ar'}).json()
    code = host['code']
    assert len(code) == 5 and code.isdigit() and host['state']['lang'] == 'ar'
    # Host can start alone.
    s = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'start', 'rounds': 3}, headers=bearer(host)).json()['state']
    assert s['phase'] == 'intro' and s['total'] == 3
    # Late joiner: no nickname, follows the host's language, lands in the current round.
    friend = client.post(f'/api/emoji-rooftop/rooms/{code}/join').json()
    assert friend['state']['lang'] == 'ar' and friend['state']['viewers'] == 2
    r = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'reveal'}, headers=bearer(friend))
    assert r.status_code == 403 and 'المضيف' in r.json()['detail']
    for rnd in range(3):
        clock['t'] = s['round_at'] + 2
        s = client.get(f'/api/emoji-rooftop/rooms/{code}', headers=bearer(friend)).json()
        assert s['phase'] == 'showing' and s['round'] == rnd and s['answer'] is None
        s = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'reveal'}, headers=bearer(host)).json()['state']
        assert s['phase'] == 'reveal' and s['answer']
        assert client.get(f'/api/emoji-rooftop/rooms/{code}', headers=bearer(friend)).json()['answer'] == s['answer']
        s = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'next'}, headers=bearer(host)).json()['state']
    assert s['status'] == 'ended'
    again = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'replay', 'rounds': 5}, headers=bearer(host)).json()['state']
    assert again['phase'] == 'intro' and again['total'] == 5


def test_api_clue_banks(api):
    client, _, _ = api
    h = {'X-Admin-Token': 'ok'}
    assert client.get('/api/emoji-rooftop/clues').status_code == 401
    for lang in ('en', 'ar'):
        r = client.get(f'/api/emoji-rooftop/clues?lang={lang}', headers=h).json()
        assert r['count'] == 50 and not r['stored'] and r['lang'] == lang
    r = client.put('/api/emoji-rooftop/clues?lang=ar', headers=h, json={'csv': 'category,emojis,answer\nأكلة,🍕,بيتزا', 'mode': 'append'}).json()
    assert r['count'] == 51 and r['stored']
    assert client.get('/api/emoji-rooftop/clues?lang=en', headers=h).json()['count'] == 50  # English untouched
    r = client.put('/api/emoji-rooftop/clues', headers=h, json={'csv': 'Food,🍕,Pizza\nMovie,🦈,Jaws', 'mode': 'replace'}).json()
    assert r['count'] == 2 and r['lang'] == 'en'
    assert client.put('/api/emoji-rooftop/clues', headers=h, json={'csv': 'Food,,Pizza'}).status_code == 400
