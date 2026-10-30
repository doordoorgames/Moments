import random
from collections import Counter

import pytest

import clock_race as E
import clock_race_data as D


def roster(n, names=None):
    names = names or [f'P{i}' for i in range(n)]
    return [dict(id=f'id{i}', name=names[i]) for i in range(n)]


# ------------------------------------------------------------------ round shape

@pytest.mark.parametrize('seed', range(300))
def test_round_shape(seed):
    tasks = E.gen_round(roster(3), rng=random.Random(seed))
    kinds = [t['type'] for t in tasks]
    assert len(tasks) == 20
    assert kinds[10] == 'vote' and kinds.count('vote') == 1
    assert kinds[19] == 'boss' and kinds.count('boss') == 1
    assert kinds.count('word') in (1, 2)
    assert 'swap' not in kinds
    assert all(kinds[i] != kinds[i - 1] for i in range(1, 20))          # never the same type twice in a row
    ordinary = Counter(k for k in kinds if k in E.ORDINARY)
    assert set(ordinary) == set(E.ORDINARY)                              # every ordinary type, every round
    assert ordinary['memory'] == 2 and all(2 <= n <= 3 for n in ordinary.values())
    assert sum(ordinary.values()) + kinds.count('word') == 18
    variants = [t['variant'] for t in tasks if t['type'] == 'word']
    assert len(variants) == len(set(variants))
    assert {t['variant'] for t in tasks if t['type'] == 'stroop'} == {'word', 'ink'} or ordinary['stroop'] < 2
    assert len({E.signature(t) for t in tasks}) == 20


def test_swapped_letters_are_gone():
    assert not hasattr(E, 'gen_swap')
    assert 'swap' not in E.ORDINARY


def test_both_word_counts_happen():
    counts = {[t['type'] for t in E.gen_round(roster(1), rng=random.Random(s))].count('word') for s in range(200)}
    assert counts == {1, 2}


# ------------------------------------------------------------------ letters

def test_alphabet_is_28_in_order():
    assert ''.join(D.ALPHABET) == 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي'
    assert len(D.EDITABLE) == 23




def test_missing_letter_rules():
    rng = random.Random(1)
    gone = set()
    for _ in range(3000):
        t = E.gen_missing(rng)
        gone.add(t['answer'])
        assert t['answer'] not in 'ابتوي'
        assert len(t['letters']) == 27 and t['answer'] not in t['letters']
        assert t['letters'] == [c for c in D.ALPHABET if c != t['answer']]
        assert len(t['choices']) == 4 and len(set(t['choices'])) == 4 and t['choices'].count(t['answer']) == 1
    assert len(gone) == 23


# ------------------------------------------------------------------ faces

def test_odd_face_task():
    rng = random.Random(3)
    for _ in range(500):
        t = E.gen_odd(rng)
        assert 0 <= t['odd'] < t['rows'] * t['cols'] and t['cols'] <= 6
        assert E.correct(t, t['odd'], [])[0]
        assert not E.correct(t, (t['odd'] + 1) % (t['rows'] * t['cols']), [])[0]


def test_boss_has_exactly_one_repeat_and_distinct_faces():
    rng = random.Random(4)
    for _ in range(300):
        t = E.gen_boss(rng)
        c = Counter(t['faces'])
        assert len(t['faces']) == 20
        assert [f for f, n in c.items() if n == 2] == [t['answer']] and max(c.values()) == 2
        uniq = [tuple(map(int, f.split('-'))) for f in c]
        for a in range(len(uniq)):
            for b in range(a + 1, len(uniq)):
                assert sum(x != y for x, y in zip(uniq[a], uniq[b])) >= 2
        twins = [i for i, f in enumerate(t['faces']) if f == t['answer']]
        assert all(E.correct(t, i, [])[0] for i in twins)
        assert not any(E.correct(t, i, [])[0] for i in range(20) if i not in twins)


# ------------------------------------------------------------------ friend question

@pytest.mark.parametrize('n', [1, 2, 5, 12])
def test_vote_lists_everyone_including_me(n):
    r = roster(n)
    t = E.gen_vote(random.Random(n), r)
    assert sorted(t['order']) == sorted(p['id'] for p in r)
    ids = [p['id'] for p in r]
    for pid in ids:
        assert E.correct(t, pid, ids)[0]          # every name, the voter's own too
    assert not E.correct(t, 'stranger', ids)[0]


def test_vote_avoids_previous_question_and_duplicate_names_work():
    for q in range(len(D.QUESTIONS)):
        for s in range(20):
            assert E.gen_vote(random.Random(s), roster(2), avoid=q)['question'] != q
    g, host = E.new_room('Sara')
    twin = E.add_player(g, 'Sara')
    assert twin['id'] != host['id']
    E.start(g, '')
    assert [p['name'] for p in g['roster']] == ['Sara', 'Sara']
    assert len(set(g['round']['tasks'][10]['order'])) == 2


# ------------------------------------------------------------------ Word Rush

def test_every_letter_pair_has_plenty_of_answers_and_follows_the_rules():
    for pair in D.LETTER_PAIRS:
        a, b = pair
        assert a not in 'QXZ' and b not in 'QXZU'
        assert len(E.word_candidates(dict(variant='pair', first=a, last=b))) >= 60, pair


def test_country_and_fruit_letters_have_several_answers():
    for letter in D.COUNTRY_LETTERS:
        assert len({v for v in E.word_candidates(dict(variant='country', letter=letter)).values()}) >= 3, letter
    for letter in D.FRUIT_LETTERS:
        assert len(E.word_candidates(dict(variant='fruit', letter=letter))) >= 3, letter


def pair(a, b):
    return dict(type='word', variant='pair', first=a, last=b)


def test_pair_answers():
    t = pair('B', 'E')
    for w in ['blue', 'BIKE', ' Brave ', 'b-l-u-e', 'Because!']:
        assert E.check_word(t, w)[0], w
    for w in ['bed', 'cake', 'bxe', 'be', '', 'blueberry', 'qwertybe']:
        assert not E.check_word(t, w)[0], w


def test_one_typo_allowed_but_never_on_the_edge_letters():
    t = pair('B', 'E')
    assert E.check_word(t, 'bridgge') == (True, 'BRIDGE')     # one extra letter
    assert E.check_word(t, 'brdge')[0]                         # one missing letter (BRIDGE or BADGE)
    assert E.check_word(t, 'bqzqze')[0] is False              # nonsense is never forgiven
    assert not E.check_word(t, 'ridge')[0]                    # missing first letter is not forgiven
    assert not E.check_word(t, 'bridg')[0]                    # missing last letter is not forgiven
    assert not E.check_word(t, 'bxe')[0]                      # short words get no typo help
    assert E.check_word(t, 'browze')[0]                       # BROWSE or BRONZE: both fit B...E


def test_ambiguous_category_typos_are_rejected():
    t = dict(type='word', variant='country', letter='M')
    assert E.check_word(t, 'malia')[0] is False or E.check_word(t, 'malia')[1] in ('Mali', 'Malta')
    near = [n for k, n in E.word_candidates(t).items() if E.within_one('malti', k)]
    assert len(near) == 2 and E.check_word(t, 'malti') == (False, None)   # Mali or Malta?


def test_countries():
    t = dict(type='word', variant='country', letter='M')
    for w in ['mexico', 'MOROCCO', 'Malaysia', 'malaysa', 'Moroco']:
        assert E.check_word(t, w)[0], w
    for w in ['mango', 'Wakanda', 'canada', 'exico']:
        assert not E.check_word(t, w)[0], w
    u = dict(type='word', variant='country', letter='U')
    for w in ['UAE', 'usa', 'U.S.A.', 'United Kingdom', 'uk', 'Ukraine']:
        assert E.check_word(u, w)[0], w
    s = dict(type='word', variant='country', letter='S')
    assert E.check_word(s, 'saudi arabia')[0] and E.check_word(s, 'Saudi')[0]


def test_fruits():
    t = dict(type='word', variant='fruit', letter='S')
    for w in ['Strawberry', 'starfruit', 'star fruit', 'strawbery']:
        assert E.check_word(t, w)[0], w
    for w in ['Spain', 'spinach', 'mango']:
        assert not E.check_word(t, w)[0], w
    p = dict(type='word', variant='fruit', letter='P')
    assert E.check_word(p, 'pineaple')[0] and not E.check_word(p, 'peru')[0]


def test_within_one():
    assert E.within_one('abc', 'abc') and E.within_one('abc', 'abd') and E.within_one('abc', 'ab')
    assert E.within_one('abc', 'xabc') and not E.within_one('abc', 'acb') and not E.within_one('abc', 'a')


# ------------------------------------------------------------------ Stroop colors

@pytest.mark.parametrize('variant', ['word', 'ink'])
def test_stroop_has_exactly_one_answer_and_a_trap(variant):
    rng = random.Random(7)
    for _ in range(3000):
        t = E.gen_stroop(rng, variant)
        assert t['variant'] == variant and len(t['choices']) == 4
        assert all(c['word'] != c['ink'] for c in t['choices'])            # every word contradicts its ink
        assert len({(c['word'], c['ink']) for c in t['choices']}) == 4
        right = [i for i in range(4) if E.stroop_matches(t, i)]
        assert right == [t['answer']]
        other = 'ink' if variant == 'word' else 'word'
        traps = [i for i, c in enumerate(t['choices']) if c[other] == t['target']]
        assert traps and t['answer'] not in traps                          # reading the wrong way is wrong
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, i, [])[0] for i in range(4) if i != t['answer'])
        assert not E.correct(t, 9, [])[0] and not E.correct(t, 'x', [])[0]


def test_stroop_answer_positions_are_random():
    rng = random.Random(8)
    assert {E.gen_stroop(rng)['answer'] for _ in range(200)} == {0, 1, 2, 3}


# ------------------------------------------------------------------ geography

def test_geography_content():
    assert len(D.GEO['country']) == 10 and len(D.GEO['city']) == 10 and len(D.GEO['continent']) == 7
    assert D.GEO['state'] == ['texas']
    assert 'texas' not in D.GEO['country'] + D.GEO['city']
    keys = [k for v in D.GEO.values() for k in v]
    assert len(keys) == len(set(keys))
    assert 'kuwait' not in keys


@pytest.mark.parametrize('variant', ['country', 'city', 'continent', 'state'])
def test_geography_has_exactly_one_of_the_category(variant):
    rng = random.Random(9)
    seen = set()
    for _ in range(2000):
        t = E.gen_geo(rng, variant)
        assert len(t['items']) == 4 and len({i['key'] for i in t['items']}) == 4
        cats = {k: c for c, keys in D.GEO.items() for k in keys}
        assert all(cats[i['key']] == i['cat'] for i in t['items'])          # every picture labeled truthfully
        assert [n for n, i in enumerate(t['items']) if i['cat'] == variant] == [t['answer']]
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, n, [])[0] for n in range(4) if n != t['answer'])
        seen.add(t['items'][t['answer']]['key'])
    assert seen == set(D.GEO[variant])


# ------------------------------------------------------------------ lonely sock

def test_sock_has_four_pairs_and_one_lonely():
    rng = random.Random(10)
    for _ in range(2000):
        t = E.gen_sock(rng)
        c = Counter(t['socks'])
        assert len(t['socks']) == 9 and len(t['tilts']) == 9
        assert sorted(c.values()) == [1, 2, 2, 2, 2]
        assert [i for i, s in enumerate(t['socks']) if c[s] == 1] == [t['answer']]
        designs = [tuple(map(int, s.split('-'))) for s in c]
        for a in range(5):
            for b in range(a + 1, 5):
                assert sum(x != y for x, y in zip(designs[a], designs[b])) >= 2   # no near-duplicates
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, i, [])[0] for i in range(9) if i != t['answer'])
    assert len({E.gen_sock(rng)['answer'] for _ in range(300)}) == 9


# ------------------------------------------------------------------ memory

@pytest.mark.parametrize('kind', ['letters', 'numbers'])
@pytest.mark.parametrize('question', ['all', 'twice'])
def test_memory_grids_have_exactly_one_valid_answer(kind, question):
    rng = random.Random(11)
    for _ in range(2000):
        t = E.gen_memory(rng, kind, question)
        assert len(t['grids']) == 3 and all(len(g) == 9 and len(set(g)) == 9 for g in t['grids'])
        pool = set(D.MEMORY_LETTERS if kind == 'letters' else D.MEMORY_NUMBERS)
        assert all(s in pool for g in t['grids'] for s in g)
        counts = E.memory_counts(t['grids'])
        want = 3 if question == 'all' else 2
        assert [s for s, n in counts.items() if n == want] == [t['answer']]   # one in the whole grid set
        assert len(t['choices']) == 4 and len(set(t['choices'])) == 4
        assert [c for c in t['choices'] if counts.get(c) == want] == [t['answer']]
        assert all(c in counts for c in t['choices'])                         # every choice was shown
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, c, [])[0] for c in t['choices'] if c != t['answer'])
        assert not E.correct(t, 'not-a-choice', [])[0]


def test_memory_never_repeats_in_a_room():
    g, host = E.new_room('Khaled')
    seen = set()
    for r in range(30):
        E.start(g, g['round']['id'] if g['round'] else '', now=r * 1000, rng=random.Random(5))  # same seed on purpose
        for t in g['round']['tasks']:
            if t['type'] == 'memory':
                assert E.memory_key(t) not in seen
                seen.add(E.memory_key(t))
        g['status'] = 'finished'


# ------------------------------------------------------------------ race

def play(g, pid, now, right=True):
    i = len(g['progress'][pid])
    t = g['round']['tasks'][i]
    value = E.solve(t, [p['id'] for p in g['roster']]) if right else wrong_for(t)
    return E.answer(g, pid, g['round']['id'], i, value, now)


def wrong_for(t):
    kind = t['type']
    if kind in ('stroop', 'geo'):
        return (t['answer'] + 1) % 4
    if kind == 'sock':
        return (t['answer'] + 1) % 9
    return {'odd': -1, 'missing': 'x', 'word': 'zzzzz', 'memory': 'nope', 'boss': -1, 'vote': 'stranger'}[kind]


def test_full_race_first_to_20_wins_and_progress_counts_by_5():
    g, host = E.new_room('Khaled')
    b = E.add_player(g, 'Noor')
    assert E.start(g, '', now=100)
    assert not E.start(g, '', now=100)                    # double tap: one round only
    rid = g['round']['id']
    with pytest.raises(E.GameError):
        E.answer(g, host['id'], rid, 0, 0, now=101)       # countdown not over
    for k in range(19):
        assert play(g, host['id'], 110 + k * 10)['done'] == k + 1
        assert play(g, b['id'], 110 + k * 10)['done'] == k + 1
    assert play(g, b['id'], 400)['done'] == 20
    assert g['winner'] == b['id'] and g['status'] == 'finished'
    late = play(g, host['id'], 401)
    assert late['changed'] is False and g['winner'] == b['id']
    view = E.view(g, host['id'])
    assert [p['done'] for p in view['players']] == [19, 20]
    assert [p['right'] for p in view['players']] == [19, 20]


def test_wrong_answer_moves_on_counts_as_a_miss_and_waits_the_sad_face():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    rid = g['round']['id']
    r = play(g, host['id'], 10, right=False)
    assert r['right'] is False and r['done'] == 1 and r['changed']        # moved on, not stuck
    assert g['misses'][host['id']] == [0]
    dup = E.answer(g, host['id'], rid, 0, E.solve(g['round']['tasks'][0], [host['id']]), now=10.2)
    assert dup['right'] is False and not dup['changed'] and dup['done'] == 1   # a miss can't become right
    t1 = g['round']['tasks'][1]
    early = E.answer(g, host['id'], rid, 1, E.solve(t1, [host['id']]), now=10.3)
    assert not early['changed'] and early['done'] == 1                     # still on the sad face
    later = 30 if t1['type'] == 'memory' else 11
    assert play(g, host['id'], later)['done'] == 2
    skip = E.answer(g, host['id'], rid, 5, None, now=40)
    assert skip['right'] is False and skip['done'] == 2 and not skip['changed']
    v = E.view(g, host['id'])['players'][0]
    assert v['done'] == 2 and v['right'] == 1


def test_all_wrong_still_finishes_with_zero_right():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    for k in range(20):
        play(g, host['id'], 10 + k * 10, right=False)
    assert g['status'] == 'finished' and g['winner'] == host['id']
    assert E.view(g, host['id'])['players'][0]['right'] == 0


def test_memory_answer_only_after_the_grids():
    g, host = E.new_room('Khaled')
    for seed in range(200):
        g['status'] = 'lobby'
        E.start(g, g['round']['id'] if g['round'] else '', now=0, rng=random.Random(seed))
        if g['round']['tasks'][0]['type'] == 'memory':
            break
    t = g['round']['tasks'][0]
    rid = g['round']['id']
    assert t['type'] == 'memory'
    start = g['round']['starts_at']
    r = E.answer(g, host['id'], rid, 0, t['answer'], now=start + 2)
    assert not r['changed'] and r['done'] == 0                             # grid 2 is still showing
    r = E.answer(g, host['id'], rid, 0, t['answer'], now=start + E.MEMORY_SHOW + 0.5)
    assert r['right'] and r['done'] == 1


def test_late_joiner_waits_for_next_round_and_replay():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    late = E.add_player(g, 'Late')
    assert late['id'] not in g['progress']
    with pytest.raises(E.GameError):
        E.answer(g, late['id'], g['round']['id'], 0, 0, now=5)
    k = 0
    while g['status'] == 'racing':
        k += 1
        play(g, host['id'], 10 * k)
    q = g['last_question']
    assert E.start(g, g['round']['id'], now=500)
    assert late['id'] in g['progress'] and g['round']['tasks'][10]['question'] != q


# ------------------------------------------------------------------ TEST99

@pytest.mark.parametrize('name', ['TEST99', 'test99', 'Test99'])
def test_test99_room_starts_with_the_host_and_one_test_bot(name):
    g, host = E.new_room(name)
    assert g['dev']
    assert [p['name'] for p in g['players']] == [name, 'Test Bot']
    bot = g['players'][1]
    assert bot['sim'] and bot['auto'] and bot['color'] != host['color']
    with pytest.raises(E.GameError):
        E.authenticate(g, bot['id'], bot['token'])                         # nobody can play as the bot
    assert E.start(g, '', now=0)                                          # host starts straight away
    assert bot['id'] in g['progress'] and len(g['bot_plans'][bot['id']]) == 20


def test_normal_rooms_have_no_bot():
    g, _ = E.new_room('Khaled')
    assert len(g['players']) == 1 and not g['dev']
    E.start(g, '', now=0)
    assert g['bot_plans'] == {}
    assert not E.sync_bots(g, now=1000)


def test_test_bot_paces_like_a_person():
    for seed in range(300):
        rng = random.Random(seed)
        tasks = E.gen_round(roster(2), rng=rng)
        plan = E.bot_plan(tasks, rng)
        times = [t for t, _ in plan]
        steps = [b - a for a, b in zip([0] + times, times)]
        assert all(b > a for a, b in zip([0] + times, times))
        assert all(1.5 <= s <= 14 for s in steps), steps                     # never instant, never stalls
        assert 55 <= times[-1] <= 130, times[-1]                             # a normal round length
    avg = sum(E.bot_plan(E.gen_round(roster(2), rng=random.Random(s)), random.Random(s))[-1][0] for s in range(200)) / 200
    assert 75 <= avg <= 100


def test_test_bot_moves_on_the_server_clock_and_can_win():
    g, host = E.new_room('test99')
    bot = g['players'][1]['id']
    E.start(g, '', now=1000, rng=random.Random(1))
    start = g['round']['starts_at']
    plan = g['bot_plans'][bot]
    assert not E.sync_bots(g, now=start + plan[0][0] - 0.01)              # nothing before its first step
    assert E.sync_bots(g, now=start + plan[4][0])
    assert len(g['progress'][bot]) == 5
    assert E.sync_bots(g, now=start + plan[11][0] + 0.5)                  # phone slept: catches up at once
    assert len(g['progress'][bot]) == 12
    assert g['progress'][bot] == [round(t, 3) for t, _ in plan[:12]]      # recorded at its planned times
    assert g['misses'][bot] == [i for i, (_, w) in enumerate(plan[:12]) if w]
    E.sync_bots(g, now=start + 10_000)
    assert g['status'] == 'finished' and g['winner'] == bot
    assert len(g['progress'][bot]) == 20
    assert not E.sync_bots(g, now=start + 20_000)


def test_host_beats_the_bot_when_faster_and_bot_steps_count_first():
    g, host = E.new_room('test99')
    bot = g['players'][1]['id']
    E.start(g, '', now=0, rng=random.Random(2))
    start = g['round']['starts_at']
    g['bot_plans'][bot] = [[i * 10.5 + 5, False] for i in range(20)]          # a slow bot: done at 204.5s
    for k in range(20):
        at = start + 10 * (k + 1)                                             # the host: done at 200s
        E.sync_bots(g, now=at)
        play(g, host['id'], at)
        if k == 9:
            assert len(g['progress'][bot]) == 10                              # the bot kept up meanwhile
    assert g['winner'] == host['id'] and len(g['progress'][bot]) == 19
    view = E.view(g, host['id'])
    assert [p['bot'] for p in view['players']] == [False, True]
    assert not E.sync_bots(g, now=start + 1000)                               # race over: the bot stops


def test_room_limits_and_dev_tools():
    g, _ = E.new_room('TEST99')
    assert g['dev'] and len(g['players']) == 2
    for i in range(10):
        E.add_player(g, f'b{i}', sim=True)
    with pytest.raises(E.GameError):
        E.add_player(g, 'one too many')
    assert len({p['color'] for p in g['players']}) == 12
    E.start(g, '', now=0)
    for _ in range(80):
        E.bots_step(g, now=10)
    assert g['status'] == 'finished' and g['winner'] in {p['id'] for p in g['players'] if p['sim'] and not p.get('auto')}
    assert E.view(g, g['host'])['timing']
    g2, _ = E.new_room('Khaled')
    assert not g2['dev'] and E.view(g2, g2['host'])['timing'] is None
