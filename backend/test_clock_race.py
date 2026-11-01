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
    lang = 'ar' if seed % 2 else 'en'
    people = 3 if seed % 3 else 1
    tasks = E.gen_round(roster(people), lang, rng=random.Random(seed))
    kinds = [t['type'] for t in tasks]
    assert len(tasks) == 30
    assert kinds[29] == 'boss' and kinds.count('boss') == 1 and kinds[28] != 'odd'
    if people >= 3:
        assert kinds[15] == 'vote' and kinds.count('vote') == 1
    else:
        assert 'vote' not in kinds                                  # the friend question needs 3+ people
    assert sum(kinds.count(k) for k in ('belong', 'older', 'compare', 'which')) >= 15
    assert kinds.count('word') in (1, 2)
    for i in range(30):                                             # a type never returns within 3 tasks
        if kinds[i] not in ('vote', 'boss'):
            assert kinds[i] not in kinds[max(0, i - 2):i], (i, kinds)
    assert len(set(kinds[:5])) == 5, kinds                           # opening five are all different
    assert kinds.count('memory') == 1
    qids = [t['qid'] for t in tasks if t.get('qid')]
    assert len(qids) == len(set(qids))                              # no question twice in a round
    assert len({E.signature(t) for t in tasks}) == 30


def test_no_swap_generator_left():
    assert not hasattr(E, 'gen_swap')


def test_both_word_counts_happen():
    counts = {[t['type'] for t in E.gen_round(roster(1), rng=random.Random(s))].count('word') for s in range(200)}
    assert counts == {1, 2}


def test_picture_answers_move_around_and_bank_rotates():
    rng = random.Random(3)
    spots = Counter(E.gen_picture(rng, 'belong')['answer'] for _ in range(400))
    assert set(spots) == {0, 1, 2, 3}
    seen = []
    for _ in range(6):
        seen += [t['qid'] for t in E.gen_round(roster(1), rng=rng, seen_q=seen[-90:]) if t.get('qid')]
    assert len(set(seen[:64])) == 64                                # four rounds without a repeat


def test_bank_counts_and_answers():
    from clock_race_bank import QUESTIONS, BY_KIND
    assert len(QUESTIONS) >= 120 and len({x['id'] for x in QUESTIONS}) == len(QUESTIONS)
    assert [len(BY_KIND[k]) for k in ('belong', 'older', 'compare', 'which')] == [35, 30, 30, 25]
    for x in QUESTIONS:
        assert x['ar'] and x['en'] and x['fact'] and x['source'] and x['difficulty']
        t = E.gen_picture(random.Random(1), x['kind'])
        assert t['options'][t['answer']][0] == E.K.BY_ID[t['qid']]['options'][0][0]


def test_friend_vote_excludes_yourself():
    g, host = E.new_room('Khaled')
    b = E.add_player(g, 'Noor')
    E.add_player(g, 'Sara')
    E.start(g, '', now=0)
    task = g['round']['tasks'][15]
    assert task['type'] == 'vote'
    assert E.correct(task, host['id'], E.vote_choices(g, task, host['id']))[0] is False
    assert E.correct(task, b['id'], E.vote_choices(g, task, host['id']))[0] is True


# ------------------------------------------------------------------ Stroop

def test_stroop_has_one_answer_and_a_trap():
    rng = random.Random(5)
    for _ in range(3000):
        t = E.gen_stroop(rng, 'ar')
        words = [c['word'] for c in t['choices']]
        inks = [c['ink'] for c in t['choices']]
        assert len(set(words)) == 4 and len(set(inks)) == 4
        assert all(c['word'] != c['ink'] for c in t['choices'])          # no word in its own colour
        key = words if t['mode'] == 'word' else inks
        trap = inks if t['mode'] == 'word' else words
        assert key.count(t['target']) == 1 and key.index(t['target']) == t['answer']
        assert trap.count(t['target']) == 1 and trap.index(t['target']) != t['answer']
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, i, [])[0] for i in range(4) if i != t['answer'])
    assert {E.gen_stroop(rng, 'en')['mode'] for _ in range(50)} == {'word', 'color'}


# ------------------------------------------------------------------ geography

def test_geo_content():
    kinds = Counter(D.GEO.values())
    assert kinds == {'country': 10, 'city': 10, 'continent': 7, 'state': 1}
    assert D.GEO['texas'] == 'state'
    assert 'australia' not in D.GEO        # would read as both a country and a continent


@pytest.mark.parametrize('variant', ['country', 'city', 'continent', 'state'])
def test_geo_exactly_one_of_the_asked_kind(variant):
    rng = random.Random(len(variant))
    for _ in range(1500):
        t = E.gen_geo(rng, 'ar', variant)
        assert len(t['items']) == 4 and len(set(t['items'])) == 4
        assert [D.GEO[k] for k in t['items']].count(variant) == 1
        assert D.GEO[t['items'][t['answer']]] == variant
        for a in t['items']:
            for b in t['items']:
                assert (a, b) not in D.GEO_SAME_PLACE


# ------------------------------------------------------------------ socks

def test_one_lonely_sock():
    rng = random.Random(6)
    for _ in range(3000):
        t = E.gen_sock(rng, 'ar')
        c = Counter(t['socks'])
        assert len(t['socks']) == 9
        assert sorted(c.values()) == [1, 2, 2, 2, 2]
        assert c[t['socks'][t['answer']]] == 1
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, i, [])[0] for i in range(9) if i != t['answer'])
        for code in c:
            col, pat, acc = map(int, code.split('-'))
            assert col < D.SOCK_COLORS and pat < D.SOCK_PATTERNS and acc < D.SOCK_ACCENTS


# ------------------------------------------------------------------ memory

@pytest.mark.parametrize('lang', ['ar', 'en'])
def test_memory_grid_is_nine_letters_with_one_answer(lang):
    rng = random.Random(len(lang))
    pool = D.MEMORY_LETTERS[lang]
    answers, grids = Counter(), set()
    for _ in range(5000):
        t = E.gen_memory(rng, lang)
        assert set(t) == {'type', 'grid', 'choices', 'answer'}   # one format only: no "twice", no sequences
        assert len(t['grid']) == 9 and len(set(t['grid'])) == 9 and set(t['grid']) <= set(pool)
        assert len(t['choices']) == 4 and len(set(t['choices'])) == 4
        assert [c for c in t['choices'] if c in t['grid']] == [t['answer']]   # exactly one was on screen
        assert all(c in pool for c in t['choices'])
        assert E.correct(t, t['answer'], [])[0]
        assert not any(E.correct(t, c, [])[0] for c in t['choices'] if c != t['answer'])
        answers[t['choices'].index(t['answer'])] += 1
        grids.add(tuple(t['grid']))
    assert min(answers.values()) > 1100                # the right answer lands in every position
    assert len(grids) > 4990                           # a fresh grid every time


def test_memory_letters_are_unique_per_language():
    for lang in ('ar', 'en'):
        assert len(set(D.MEMORY_LETTERS[lang])) == len(D.MEMORY_LETTERS[lang]) >= 13


# ------------------------------------------------------------------ faces

def test_odd_face_task():
    rng = random.Random(3)
    for _ in range(500):
        t = E.gen_odd(rng, 'ar')
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
        twins = [i for i, f in enumerate(t['faces']) if f == t['answer']]
        assert all(E.correct(t, i, [])[0] for i in twins)
        assert not any(E.correct(t, i, [])[0] for i in range(20) if i not in twins)


# ------------------------------------------------------------------ friend question

@pytest.mark.parametrize('n', [1, 2, 5, 12])
def test_vote_lists_everyone_including_me(n):
    r = roster(n)
    t = E.gen_vote(random.Random(n), r)
    ids = [p['id'] for p in r]
    assert sorted(t['order']) == sorted(ids)
    assert all(E.correct(t, pid, ids)[0] for pid in ids)
    assert not E.correct(t, 'stranger', ids)[0]


def test_questions_exist_in_both_languages():
    assert all(ar and en for ar, en in D.QUESTIONS) and len(D.QUESTIONS) == 15


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

def play(g, pid, now, right=True):
    i = len(g['progress'][pid])
    t = g['round']['tasks'][i]
    value = E.solve(t, [p['id'] for p in g['roster']]) if right else wrong_value(t)
    return E.answer(g, pid, g['round']['id'], i, value, now)


def wrong_value(t):
    return {'odd': -1, 'memory': 'x', 'stroop': -1, 'geo': -1, 'sock': -1,
            'word': 'zzzzz', 'vote': 'stranger', 'boss': -1,
            'scale': -1, 'wallet': -1, 'shadow': -1, 'tile': -1, 'avoid': -1,
            'belong': -1, 'older': -1, 'compare': -1, 'which': -1, 'animal': -1}[t['type']]


def walk(g, pid, now, right=True):
    """Answer the next task as soon as the server allows it; returns the new time."""
    i = len(g['progress'][pid])
    now = max(now, E.reached_at(g, pid, i) + E.show_time(g['round']['tasks'][i]))
    r = play(g, pid, now, right)
    assert 'wait' not in r
    return now + 0.01, r


def test_full_race_every_answer_moves_on_and_first_to_20_wins():
    g, host = E.new_room('Khaled')
    b = E.add_player(g, 'Noor')
    assert E.start(g, '', now=100)
    assert not E.start(g, '', now=100)                    # double tap: one round only
    t_host = t_b = 103
    for k in range(E.TASKS - 1):
        t_host, r = walk(g, host['id'], t_host, right=(k not in (0, 9)))   # two wrong (two hearts): still moves on
        assert r['done'] == k + 1 and r['right'] == (k not in (0, 9)) or g['round']['tasks'][k]['type'] == 'vote'
        t_b, r = walk(g, b['id'], t_b)
    t_b, r = walk(g, b['id'], t_b)
    assert r['done'] == E.TASKS and g['winner'] == b['id'] and g['status'] == 'finished'
    late = play(g, host['id'], t_host + 10)
    assert late['changed'] is False and g['winner'] == b['id']
    view = E.view(g, host['id'])
    me = [p for p in view['players'] if p['id'] == host['id']][0]
    assert me['done'] == E.TASKS - 1 and me['right'] < E.TASKS - 1        # wrong answers were counted as wrong


def test_wrong_answer_holds_one_second_and_never_counts_as_right():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    rid = g['round']['id']
    while g['round']['tasks'][len(g['progress'][host['id']])]['type'] == 'memory':
        walk(g, host['id'], 10)
    i = len(g['progress'][host['id']])
    t0 = E.reached_at(g, host['id'], i) + E.show_time(g['round']['tasks'][i])
    r = E.answer(g, host['id'], rid, i, wrong_value(g['round']['tasks'][i]), now=t0)
    assert r['right'] is False and r['done'] == i + 1 and g['progress'][host['id']][i][1] is False
    again = E.answer(g, host['id'], rid, i, E.solve(g['round']['tasks'][i], [host['id']]), now=t0 + 0.1)
    assert again['right'] is False and not again['changed']                  # can't redo a wrong one
    nxt = g['round']['tasks'][i + 1]
    early = E.answer(g, host['id'], rid, i + 1, E.solve(nxt, [host['id']]), now=t0 + 0.3)
    assert early.get('wait', 0) > 0 and not early['changed']                 # the 1s pause is enforced
    ok = E.answer(g, host['id'], rid, i + 1, E.solve(nxt, [host['id']]), now=t0 + E.WRONG_DELAY + E.show_time(nxt))
    assert ok['changed'] and ok['done'] == i + 2


def test_memory_has_no_forced_wait():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    now = 5
    while g['round']['tasks'][len(g['progress'][host['id']])]['type'] != 'memory':
        now, _ = walk(g, host['id'], now)
    i = len(g['progress'][host['id']])
    t = g['round']['tasks'][i]
    r = E.answer(g, host['id'], g['round']['id'], i, t['answer'], now=E.reached_at(g, host['id'], i) + 0.5)
    assert r['changed'] and r['right']                       # the player taps Next whenever ready


def test_three_wrong_answers_reset_the_clock_and_refill_hearts():
    g, host = E.new_room('Khaled')
    E.start(g, '', now=0)
    pid, rid, now = host['id'], g['round']['id'], 3
    for _ in range(4):
        now, _ = walk(g, pid, now)
    assert len(g['progress'][pid]) == 4
    misses = []
    while True:
        i = len(g['progress'][pid])
        t = g['round']['tasks'][i]
        if t['type'] == 'vote':
            now, _ = walk(g, pid, now)
            continue
        now = max(now, E.reached_at(g, pid, i))
        r = E.answer(g, pid, rid, i, wrong_value(t), now=now, epoch=0)
        now += 0.01
        misses.append(r['misses'])
        if r.get('reset'):
            break
    assert misses == [1, 2, 0] and r['done'] == 0 and r['epoch'] == 1
    assert g['progress'][pid] == []
    stale = E.answer(g, pid, rid, 0, 0, now=now + 5, epoch=0)          # a retry from before the reset
    assert not stale['changed']
    early = E.answer(g, pid, rid, 0, E.solve(g['round']['tasks'][0], [pid]), now=now, epoch=1)
    assert early.get('wait')                                            # the heartbreak pause
    ok = E.answer(g, pid, rid, 0, E.solve(g['round']['tasks'][0], [pid]), now=now + E.RESET_DELAY, epoch=1)
    assert ok['right'] and ok['done'] == 1 and ok['misses'] == 0


def test_odd_face_modes_are_spread():
    modes = set()
    for s in range(200):
        for t in E.gen_round(roster(2), rng=random.Random(s)):
            if t['type'] == 'odd':
                modes.add((t['base'], t['mood']))
    assert modes == set(E.ODD_MODES)


def test_late_joiner_waits_for_next_round_and_replay():
    g, host = E.new_room('Khaled', 'en')
    E.start(g, '', now=0)
    late = E.add_player(g, 'Late')
    assert late['id'] not in g['progress']
    with pytest.raises(E.GameError):
        E.answer(g, late['id'], g['round']['id'], 0, 0, now=5)
    now = 5
    while g['status'] == 'racing':
        now, _ = walk(g, host['id'], now)
    q = g['last_question']
    assert E.start(g, g['round']['id'], now=now + 50)
    assert late['id'] in g['progress'] and q is None             # two people: no friend question


# ------------------------------------------------------------------ TEST99 bot

def test_test99_room_comes_with_one_test_bot():
    g, host = E.new_room('test99')
    assert g['dev'] and [p['name'] for p in g['players']] == ['test99', 'Test Bot']
    assert g['players'][1]['sim'] and not g['players'][0]['sim']
    normal, _ = E.new_room('Khaled')
    assert len(normal['players']) == 1 and not normal['dev']


def test_bot_moves_at_a_human_pace_by_the_clock():
    g, host = E.new_room('TEST99')
    bot = g['players'][1]['id']
    assert E.start(g, '', now=1000)
    plan = g['bots'][bot]
    gaps = [b[0] - a[0] for a, b in zip([[0, True]] + plan, plan)]
    assert len(plan) == E.TASKS and all(1.3 <= gap <= 21 for gap in gaps)
    assert 60 <= plan[-1][0] <= 220                          # a whole round takes two to three minutes
    E.sync_bots(g, now=1003 + 0.5)
    assert len(g['progress'][bot]) == 0                      # nothing before its first finish time
    E.sync_bots(g, now=1003 + plan[4][0] + 0.01)
    assert len(g['progress'][bot]) == 5
    E.sync_bots(g, now=1003 + plan[4][0] + 0.02)
    assert len(g['progress'][bot]) == 5                      # no jumps without time passing
    E.sync_bots(g, now=1003 + plan[-1][0] + 1)
    assert g['status'] == 'finished' and g['winner'] == bot
    assert g['ended_at'] == pytest.approx(1003 + plan[-1][0])


def test_bot_loses_to_a_faster_human_and_human_loses_if_bot_finished_first():
    g, host = E.new_room('TEST99')
    bot = g['players'][1]['id']
    E.start(g, '', now=0)
    now = 3
    while g['status'] == 'racing' and len(g['progress'][host['id']]) < E.TASKS:
        now, _ = walk(g, host['id'], now)
    assert g['winner'] == host['id']                        # instant answers beat the bot
    g2, h2 = E.new_room('TEST99')
    bot2 = g2['players'][1]['id']
    E.start(g2, '', now=0)
    plan = g2['bots'][bot2]
    now = 3
    for k in range(E.TASKS - 1):
        now, _ = walk(g2, h2['id'], now)
    late = 3 + plan[-1][0] + 30
    r = play(g2, h2['id'], late)
    assert g2['winner'] == bot2                              # the bot crossed the line first
    assert r['changed'] is False


def test_room_limits_and_dev_tools():
    g, _ = E.new_room('TEST99')
    for i in range(10):
        E.add_player(g, f'b{i}', sim=True)
    with pytest.raises(E.GameError):
        E.add_player(g, 'one too many')
    assert len({p['color'] for p in g['players']}) == 12
    E.start(g, '', now=0)
    assert len(g['bots']) == 11
    E.sync_bots(g, now=10_000)
    assert g['status'] == 'finished' and g['winner'] in g['bots']
    v = E.view(g, g['host'])
    assert v['timing'] == {} and len(v['bots']) == 11 and v['lang'] == 'ar'
    g2, _ = E.new_room('Khaled', 'en')
    v2 = E.view(g2, g2['host'])
    assert not g2['dev'] and v2['timing'] is None and v2['lang'] == 'en'
    E.start(g2, '', now=0)
    assert E.view(g2, g2['host'])['round']['question'] is None    # one person: no friend question
    g3, h3 = E.new_room('Khaled', 'en')
    E.add_player(g3, 'Noor'); E.add_player(g3, 'Sara')
    E.start(g3, '', now=0)
    assert E.view(g3, h3['id'])['round']['question'] in [en for _, en in D.QUESTIONS]


# ------------------------------------------------------------------ v4 challenges

def test_scale_has_one_heaviest():
    for s in range(300):
        t = E.gen_scale(random.Random(s), 'ar')
        totals = [g['count'] * g['each'] for g in t['groups']]
        assert max(totals) == totals[t['answer']] and totals.count(max(totals)) == 1


def test_wallet_has_one_richest():
    for s in range(300):
        t = E.gen_wallet(random.Random(s), 'ar')
        totals = [sum(w) for w in t['wallets']]
        assert max(totals) == totals[t['answer']] and totals.count(max(totals)) == 1


def test_shadow_options_all_differ_and_one_is_right():
    for s in range(300):
        t = E.gen_shadow(random.Random(s), 'en')
        shapes = [tuple(E._norm([tuple(c) for c in o])) for o in t['options']]
        assert len(set(shapes)) == 4
        assert shapes[t['answer']] == tuple(E._norm([tuple(c) for c in t['cells']]))


def test_tile_has_one_unmirrored_turned_piece():
    for s in range(200):
        t = E.gen_tile(random.Random(s), 'ar')
        assert t['pic'] in E.TILE_SET and len(t['opts']) == 4
        assert [o[0] for o in t['opts']].count('none') == 1 and t['opts'][t['answer']][0] == 'none'
        assert all(o[1] in (90, 180, 270) for o in t['opts'])
    for pic, opts in E.TILE_SET.items():
        flips = sorted(o[0] for o in opts if o[0] != 'none')
        assert flips in (['H', 'H', 'V'], ['H', 'V', 'V']), pic


def test_avoid_rule_has_safe_and_forbidden_buttons():
    for s in range(300):
        t = E.gen_avoid(random.Random(s), 'ar')
        key = 0 if t['rule'] == 'color' else 1
        assert len(t['items']) == 9 and 2 <= len(t['safe']) <= 4
        for i, it in enumerate(t['items']):
            assert (it[key] != t['target']) == (i in t['safe'])
            assert E.correct(t, i, [])[0] == (i in t['safe'])
