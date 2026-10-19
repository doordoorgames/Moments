import pytest
from fastapi import FastAPI, HTTPException, Header
from fastapi.testclient import TestClient

import emoji_rooftop as E
from emoji_rooftop_api import router


def clue(answer, aliases=()):
    return dict(category='Movie', emojis='🐀👨‍🍳', answer=answer, aliases=list(aliases))


@pytest.mark.parametrize('guess,answer,ok', [
    ('ratatoullie', 'Ratatouille', True), ('spiderman', 'Spider-Man', True), ('Spider man', 'Spider-Man', True),
    ('lion king', 'The Lion King', True), ('the lion kng', 'The Lion King', True), ('mexcio', 'Mexico', True),
    ('fish & chips', 'Fish and Chips', True), ('Up', 'Up', True), ('us', 'Up', False), ('car', 'Cars', True),
    ('jaws', 'Jaws', True), ('jams', 'Jaws', True), ('hello', 'Jaws', False), ('frozen', 'Shrek', False),
    ('pirates of the carribean', 'Pirates of the Caribbean', True), ('', 'Up', False),
])
def test_matching(guess, answer, ok):
    assert E.matches(guess, clue(answer)) is ok


def test_aliases():
    assert E.matches('majboos', clue('Machboos', ['majboos']))


def test_seed_bank():
    assert len(E.SEED) == 50 and all(c['emojis'] and c['answer'] for c in E.SEED)
    assert E.parse_csv(E.to_csv(E.SEED))[0] == E.SEED


def test_csv_errors():
    clues, errors = E.parse_csv('category,emojis,answer\nMovie,,Jaws\nFood,🍕,Pizza')
    assert len(clues) == 1 and errors


def game(n=3, rounds=5, now=1000.0):
    g, host = E.new_game('Host', rounds)
    for i in range(1, n):
        E.add_player(g, f'P{i}')
    E.start(g, E.SEED, now)
    return g


def test_player_limits():
    g, _ = E.new_game('Host', 5)
    for i in range(11):
        E.add_player(g, f'P{i}')
    with pytest.raises(E.GameError):
        E.add_player(g, 'Thirteen')
    with pytest.raises(E.GameError):
        E.add_player(E.new_game('A', 5)[0], 'a')


def test_needs_two_players():
    g, _ = E.new_game('Host', 5)
    with pytest.raises(E.GameError):
        E.start(g, E.SEED, 0)


def test_rounds_flow_first_correct_wins():
    g = game()
    host, p1, p2 = [p['id'] for p in g['players']]
    t0 = g['started_at']
    assert E.position(g, t0 - 1) == ('intro', 0)
    assert E.view(g, host, t0 - 1).get('clue') is None
    v = E.view(g, host, t0 + 0.1)
    assert v['phase'] == 'guessing' and v['answer'] is None and v['clue']['emojis']
    assert E.guess(g, p1, 'x', 0, g['run'], t0 + 0.1) == 'closed'  # still spinning
    answer = g['clues'][0]['answer']
    assert E.guess(g, p1, 'definitely wrong guess', 0, g['run'], t0 + 2) == 'wrong'
    assert E.guess(g, p2, answer, 0, g['run'], t0 + 3) == 'correct'
    assert E.guess(g, p1, answer, 0, g['run'], t0 + 3.1) == 'closed'
    v = E.view(g, p1, t0 + 3.5)
    assert v['phase'] == 'reveal' and v['answer'] == answer and v['solved_by'] == p2
    assert E.scores(g)[p2] == 1
    t1 = t0 + 3 + E.REVEAL
    assert E.position(g, t1 + 0.01) == ('guessing', 1)


def test_timeout_and_end():
    g = game(rounds=2)
    t = g['started_at']
    for _ in range(2):
        t += E.SPIN + E.GUESS + E.REVEAL
    assert E.position(g, t - 0.5)[0] == 'reveal'
    assert E.position(g, t + 0.1) == ('ended', 1)
    v = E.view(g, g['host'], t + 0.1)
    assert v['status'] == 'ended' and all(p['score'] == 0 for p in v['players'])


def test_unique_clues_and_custom_round_cap():
    g = game(rounds=50)
    assert len({c['answer'] for c in g['clues']}) == 50
    g2, _ = E.new_game('H', 5)
    E.add_player(g2, 'B')
    E.start(g2, E.SEED[:3], 0)
    assert len(g2['solves']) == 3


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
    host = client.post('/api/emoji-rooftop/rooms', json={'nickname': 'Khaled', 'rounds': 5}).json()
    code = host['code']
    assert len(code) == 5 and code.isdigit()
    friend = client.post(f'/api/emoji-rooftop/rooms/{code}/join', json={'nickname': 'Partner'}).json()
    assert client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'start'}, headers=bearer(friend)).status_code == 403
    s = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'start', 'rounds': 3}, headers=bearer(host)).json()['state']
    assert s['phase'] == 'intro' and s['total'] == 3
    for rnd in range(3):
        clock['t'] = s['starts_at'] + 2
        s = client.get(f'/api/emoji-rooftop/rooms/{code}', headers=bearer(friend)).json()
        assert s['phase'] == 'guessing' and s['round'] == rnd and s['answer'] is None
        r = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'guess', 'text': 'zzzzzzzz', 'round': rnd, 'run': s['run']}, headers=bearer(friend)).json()
        assert r['result'] == 'wrong'
        # Look up the answer from the stored game to play a perfect round.
        import json as _json
        from emoji_rooftop_api import PREFIX
        row = next(x for x in db.rows if x['code'] == code)
        from cryptography.fernet import Fernet
        import base64, hashlib
        f = Fernet(base64.urlsafe_b64encode(hashlib.sha256(b'emoji-rooftop:test-key').digest()))
        g = _json.loads(f.decrypt(row['flags'][0][len(PREFIX):].encode()))
        r = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'guess', 'text': g['clues'][rnd]['answer'].lower(), 'round': rnd, 'run': s['run']}, headers=bearer(friend)).json()
        assert r['result'] == 'correct' and r['state']['answer']
        clock['t'] = r['state']['next_at'] + 0.01
        s = client.get(f'/api/emoji-rooftop/rooms/{code}', headers=bearer(host)).json()
    assert s['status'] == 'ended'
    assert {p['name']: p['score'] for p in s['players']} == {'Khaled': 0, 'Partner': 3}
    again = client.post(f'/api/emoji-rooftop/rooms/{code}/action', json={'action': 'replay', 'rounds': 5}, headers=bearer(host)).json()['state']
    assert again['phase'] == 'intro' and again['total'] == 5 and all(p['score'] == 0 for p in again['players'])


def test_api_clue_bank(api):
    client, _, _ = api
    assert client.get('/api/emoji-rooftop/clues').status_code == 401
    r = client.get('/api/emoji-rooftop/clues', headers={'X-Admin-Token': 'ok'}).json()
    assert r['count'] == 50 and not r['stored']
    r = client.put('/api/emoji-rooftop/clues', headers={'X-Admin-Token': 'ok'}, json={'csv': 'category,emojis,answer\nFood,🍕🇮🇹,Pizza', 'mode': 'append'}).json()
    assert r['count'] == 51 and r['stored']
    r = client.put('/api/emoji-rooftop/clues', headers={'X-Admin-Token': 'ok'}, json={'csv': 'Food,🍕🇮🇹,Pizza\nMovie,🦈,Jaws', 'mode': 'replace'}).json()
    assert r['count'] == 2
    assert client.put('/api/emoji-rooftop/clues', headers={'X-Admin-Token': 'ok'}, json={'csv': 'Food,,Pizza'}).status_code == 400
