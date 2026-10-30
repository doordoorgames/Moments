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
    assert all(not (kinds[i] == kinds[i - 1] == kinds[i - 2]) for i in range(2, 20))
    ordinary = Counter(k for k in kinds if k in E.ORDINARY)
    assert max(ordinary.values()) - min(ordinary.values()) <= 1 and len(ordinary) == 3
    variants = [t['variant'] for t in tasks if t['type'] == 'word']
    assert len(variants) == len(set(variants))
    assert len({E.signature(t) for t in tasks}) == 20


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


def test_swapped_letter_rules():
    rng = random.Random(2)
    for _ in range(3000):
        t = E.gen_swap(rng)
        i, j = t['answer']
        assert i != j and 3 <= i <= 25 and 3 <= j <= 25
        assert t['letters'][:3] == list('ابت') and t['letters'][-2:] == list('وي')
        diff = [k for k in range(28) if t['letters'][k] != D.ALPHABET[k]]
        assert diff == [i, j]
        assert E.correct(t, [j, i], [])[0] and E.correct(t, [i, j], [])[0]
        assert not E.correct(t, [i, i], [])[0] and not E.correct(t, [i], [])[0]


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


# ------------------------------------------------------------------ race

def play(g, pid, now):
    i = len(g['progress'][pid])
    t = g['round']['tasks'][i]
    return E.answer(g, pid, g['round']['id'], i, E.solve(t, [p['id'] for p in g['roster']]), now)


def test_full_race_first_to_20_wins_and_progress_counts_by_5():
    g, host = E.new_room('Khaled')
    b = E.add_player(g, 'Noor')
    assert E.start(g, '', now=100)
    assert not E.start(g, '', now=100)                    # double tap: one round only
    rid = g['round']['id']
    with pytest.raises(E.GameError):
        E.answer(g, host['id'], rid, 0, 0, now=101)       # countdown not over
    for k in range(19):
        assert play(g, host['id'], 104 + k)['done'] == k + 1
        assert play(g, b['id'], 104 + k)['done'] == k + 1
    assert play(g, b['id'], 130)['done'] == 20
    assert g['winner'] == b['id'] and g['status'] == 'finished'
    late = play(g, host['id'], 131)
    assert late['changed'] is False and g['winner'] == b['id']
    view = E.view(g, host['id'])
    assert [p['done'] for p in view['players']] == [19, 20]


def test_wrong_answers_cost_nothing_and_duplicates_are_ignored():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    rid = g['round']['id']
    t0 = g['round']['tasks'][0]
    wrong = {'odd': -1, 'missing': 'x', 'swap': [0, 1], 'word': 'zzzzz'}[t0['type']]
    for _ in range(5):
        r = E.answer(g, host['id'], rid, 0, wrong, now=5)
        assert r['right'] is False and r['done'] == 0
    assert play(g, host['id'], 6)['done'] == 1
    again = E.answer(g, host['id'], rid, 0, wrong, now=6)
    assert again['right'] is True and again['done'] == 1 and not again['changed']
    skip = E.answer(g, host['id'], rid, 5, None, now=6)
    assert skip['right'] is False and skip['done'] == 1


def test_late_joiner_waits_for_next_round_and_replay():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    late = E.add_player(g, 'Late')
    assert late['id'] not in g['progress']
    with pytest.raises(E.GameError):
        E.answer(g, late['id'], g['round']['id'], 0, 0, now=5)
    while g['status'] == 'racing':
        play(g, host['id'], 10)
    q = g['last_question']
    assert E.start(g, g['round']['id'], now=50)
    assert late['id'] in g['progress'] and g['round']['tasks'][10]['question'] != q


def test_room_limits_and_dev():
    g, _ = E.new_room('TEST99')
    assert g['dev']
    for i in range(11):
        E.add_player(g, f'b{i}', sim=True)
    with pytest.raises(E.GameError):
        E.add_player(g, 'one too many')
    assert len({p['color'] for p in g['players']}) == 12
    E.start(g, '', now=0)
    for _ in range(80):
        E.bots_step(g, now=10)
    assert g['status'] == 'finished' and g['winner'] in {p['id'] for p in g['players'] if p['sim']}
    assert E.view(g, g['host'])['timing']
    g2, _ = E.new_room('Khaled')
    assert not g2['dev'] and E.view(g2, g2['host'])['timing'] is None
