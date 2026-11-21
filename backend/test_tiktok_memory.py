import pytest

import tiktok_memory as T
from tiktok_memory_words import WORDS


def scribble(n=3):
    return [[10 * i, 20 * i, 10 * i + 30, 20 * i + 40] for i in range(n)]


def play_turn(g, now, right):
    """Drawer taps ready, draws every word, judge marks the first `right` words right."""
    d, j = T.drawer(g), T.judge(g)
    T.ready(g, d, now)
    end = T.draw_end(g)
    T.submit(g, d, {str(i): scribble() for i in range(g['length'])}, end)
    assert g['phase'] == 'recall'
    for i in range(g['length']):
        T.mark(g, j, i, i < right)
    T.lock(g, j)
    return end + 1


def test_word_bank_is_clean():
    en = [w[0].casefold() for w in WORDS]
    ar = [w[1] for w in WORDS]
    assert len(WORDS) >= 300 and len(set(en)) == len(en) and len(set(ar)) == len(ar)
    assert all(a.strip() and b.strip() for a, b in WORDS)


def test_lengths_names_and_seats():
    g, host = T.new_game('Khaled', 'ar')
    assert g['length'] == 12 and T.LENGTHS[12] == (3, 4) and T.LENGTHS[20] == (4, 5)
    with pytest.raises(T.GameError):
        T.new_game('Khaled', 'en', 10)
    with pytest.raises(T.GameError) as e:
        T.add_player(g, 'khaled')
    assert 'مأخوذ' in e.value.text('ar')
    with pytest.raises(T.GameError):
        T.add_player(g, '   ')
    for i in range(T.MAX_PLAYERS - 1):
        T.add_player(g, f'P{i}')
    with pytest.raises(T.GameError):
        T.add_player(g, 'late')


def test_one_player_at_a_time_and_host_judged_by_next_player():
    g, host = T.new_game('Khaled', 'en', 9)
    sara = T.add_player(g, 'Sara')
    noor = T.add_player(g, 'Noor')
    T.start(g, 0)
    assert g['phase'] == 'ready' and T.drawer(g) == host['id'] and T.judge(g) == sara['id']
    # Only the drawer starts their own turn.
    with pytest.raises(T.GameError):
        T.ready(g, sara['id'], 0)
    T.ready(g, host['id'], 10)
    assert g['draw_at'] == 10 + T.COUNTDOWN and len(g['words']) == 9 and len(set(g['words'])) == 9
    # Watchers see the words while the drawer draws; nobody sees them once recall starts until marked.
    v = T.view(g, noor['id'], 14)
    assert v['phase'] == 'drawing' and v['words'] == g['words']
    end = T.draw_end(g)
    T.submit(g, host['id'], {'0': scribble()}, end - 3)
    assert g['phase'] == 'drawing'
    # Missing drawings: drawing closes on its own after the grace time, blanks stay blank.
    v = T.view(g, noor['id'], end + T.GRACE + 0.1)
    assert v['phase'] == 'recall' and v['drawings'][0] and v['drawings'][1] == [] and v['words'] == [None] * 9
    assert T.view(g, sara['id'], end + T.GRACE + 0.1)['words'] == g['words']  # the judge has the key
    with pytest.raises(T.GameError):
        T.mark(g, host['id'], 0, True)
    T.mark(g, sara['id'], 0, True)
    assert T.view(g, noor['id'], end + 20)['words'][0] == g['words'][0]
    with pytest.raises(T.GameError):
        T.lock(g, sara['id'])  # every word must be marked
    for i in range(1, 9):
        T.mark(g, sara['id'], i, i % 2 == 0)
    T.lock(g, sara['id'])
    assert g['phase'] == 'result' and g['scores'][host['id']] == 5
    with pytest.raises(T.GameError):
        T.next_turn(g, sara['id'], 50)
    T.next_turn(g, host['id'], 50)
    assert T.drawer(g) == sara['id'] and T.judge(g) == host['id']


def test_fresh_words_every_turn():
    g, host = T.new_game('A', 'en', 20)
    others = [T.add_player(g, n) for n in 'BCD']
    T.start(g, 0)
    seen = set()
    now = 0
    for _ in range(4):
        T.ready(g, T.drawer(g), now)
        assert not seen & set(g['words'])
        seen |= set(g['words'])
        T.submit(g, T.drawer(g), {str(i): [] for i in range(20)}, T.draw_end(g))
        for i in range(20):
            T.mark(g, T.judge(g), i, False)
        T.lock(g, T.judge(g))
        T.next_turn(g, host['id'], now)
        now += 100
    assert g['status'] == 'ended' and len(seen) == 80
    assert all(g['scores'][p['id']] == 0 for p in others)


def test_arabic_room_plays_arabic_words():
    g, host = T.new_game('خالد', 'ar', 9)
    T.start(g, 0)
    T.ready(g, host['id'], 0)
    arabic = {w[1] for w in WORDS}
    assert all(w in arabic for w in g['words'])
    assert T.judge(g) == host['id'] and T.view(g, host['id'], 1)['self_judge']  # alone: marks his own run


def test_strokes_are_cleaned():
    s = T.clean_strokes([[-5, 500, 10.4, 20.6, 'x', 3], 'junk', [1, 2, 3]] + [[1, 1]] * 200)
    assert s[0] == [0, 400, 10, 21] and s[1] == [1, 2] and len(s) <= T.MAX_STROKES
    assert sum(len(x) for x in T.clean_strokes([[5] * 5000])) == T.MAX_POINTS
    with pytest.raises(T.GameError):
        T.clean_strokes('nope')


def test_tie_for_first_and_tiebreaker():
    g, host = T.new_game('Khaled', 'en', 9)
    sara, noor = T.add_player(g, 'Sara'), T.add_player(g, 'Noor')
    T.start(g, 0)
    now = 0
    for right in (8, 8, 3):
        now = play_turn(g, now, right)
        T.next_turn(g, host['id'], now)
    assert g['status'] == 'ended'
    rows, tied, winner = T.standings(g)
    assert winner is None and set(tied) == {host['id'], sara['id']} and rows[-1]['id'] == noor['id']
    with pytest.raises(T.GameError):
        T.tiebreak(g, sara['id'], now)
    T.tiebreak(g, host['id'], now)
    assert g['status'] == 'playing' and g['order'] == [host['id'], sara['id']] and g['tiebreak']
    late = T.add_player(g, 'Late')  # no turn during a tiebreaker
    assert late['id'] not in g['order']
    now = play_turn(g, now, 6)
    T.next_turn(g, host['id'], now)
    now = play_turn(g, now, 7)
    T.next_turn(g, host['id'], now)
    rows, tied, winner = T.standings(g)
    assert winner == sara['id'] and not tied and rows[0]['id'] == sara['id'] and rows[0]['tb'] == 7
    assert g['scores'][host['id']] == 8 and g['tb'][host['id']] == 6
    with pytest.raises(T.GameError):
        T.tiebreak(g, host['id'], now)
    T.replay(g, now)
    assert g['scores'] == {} and g['order'][0] == host['id'] and len(g['order']) == 4


def test_tie_below_first_needs_no_tiebreaker():
    g, host = T.new_game('A', 'en', 9)
    T.add_player(g, 'B'), T.add_player(g, 'C')
    T.start(g, 0)
    now = 0
    for right in (9, 4, 4):
        now = play_turn(g, now, right)
        T.next_turn(g, host['id'], now)
    rows, tied, winner = T.standings(g)
    assert winner == host['id'] and not tied


def test_host_can_skip_and_close_drawing():
    g, host = T.new_game('A', 'en', 9)
    b = T.add_player(g, 'B')
    T.start(g, 0)
    T.next_turn(g, host['id'], 0)  # skip A's own turn while ready
    assert T.drawer(g) == b['id']
    T.ready(g, b['id'], 0)
    with pytest.raises(T.GameError):
        T.finish_drawing(g, host['id'], 5)
    T.finish_drawing(g, host['id'], T.draw_end(g))
    assert g['phase'] == 'recall' and g['drawings'] == [[]] * 9


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
    pytest.importorskip('fastapi')
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from tiktok_memory_api import router
    monkeypatch.setenv('SUPABASE_KEY', 'test-key')
    db, clock = DB(), {'t': 5000.0}

    async def query(fn):
        return fn()

    app = FastAPI()
    app.include_router(router(lambda: db, query, clock=lambda: clock['t']))
    return TestClient(app), clock, db


def bearer(r):
    return {'Authorization': f"Bearer {r['player_id']}:{r['token']}"}


def test_api_full_turn(api):
    client, clock, _ = api
    base = '/api/tiktok-memory/rooms'
    host = client.post(base, json={'name': 'Khaled', 'lang': 'ar', 'length': 9}).json()
    code = host['code']
    assert len(code) == 5 and host['state']['lang'] == 'ar' and host['state']['cols'] == 3
    sara = client.post(f'{base}/{code}/join', json={'name': 'Sara'}).json()
    assert client.post(f'{base}/{code}/join', json={'name': 'sara'}).status_code == 400
    r = client.post(f'{base}/{code}/action', json={'action': 'start'}, headers=bearer(sara))
    assert r.status_code == 400 and 'المضيف' in r.json()['detail']
    s = client.post(f'{base}/{code}/action', json={'action': 'start', 'length': 12}, headers=bearer(host)).json()['state']
    assert s['phase'] == 'ready' and s['drawer'] == host['player_id'] and s['judge'] == sara['player_id'] and s['length'] == 12
    s = client.post(f'{base}/{code}/action', json={'action': 'ready'}, headers=bearer(host)).json()['state']
    assert s['phase'] == 'drawing' and len(s['words']) == 12
    clock['t'] = s['draw_at'] + 12 * s['step']
    s = client.post(f'{base}/{code}/draw', json={'drawings': {str(i): [[1, 2, 3, 4]] for i in range(12)}}, headers=bearer(host)).json()['state']
    assert s['phase'] == 'recall' and s['words'] == [None] * 12 and s['drawings'][5] == [[1, 2, 3, 4]]
    key = client.get(f'{base}/{code}', headers=bearer(sara)).json()['words']
    assert all(key)
    assert client.post(f'{base}/{code}/mark', json={'index': 0, 'value': True}, headers=bearer(host)).status_code == 400
    for i in range(12):
        s = client.post(f'{base}/{code}/mark', json={'index': i, 'value': i < 10}, headers=bearer(sara)).json()['state']
    s = client.post(f'{base}/{code}/action', json={'action': 'lock'}, headers=bearer(sara)).json()['state']
    assert s['phase'] == 'result' and s['scores'][host['player_id']] == 10
    s = client.post(f'{base}/{code}/action', json={'action': 'next'}, headers=bearer(host)).json()['state']
    assert s['drawer'] == sara['player_id'] and s['judge'] == host['player_id']
    assert client.get(f'{base}/99999', headers=bearer(host)).status_code == 404
