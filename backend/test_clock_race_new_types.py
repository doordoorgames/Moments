"""Tap the incorrect word, the visual IQ puzzles, studio delete, and the (off by default) catch-up gamble."""
import copy
import random

import pytest

import clock_race as E
import clock_race_content as C
import clock_race_iq as Q
import clock_race_wrongword as W


# ------------------------------------------------------------------ tap the incorrect word

def test_fifteen_arabic_and_fifteen_english_wrong_word_questions():
    b = W.builtin()
    assert sum(d['lang'] == 'ar' for d in b.values()) == 15
    assert sum(d['lang'] == 'en' for d in b.values()) == 15
    for qid, d in b.items():
        assert W.validate(d) == [], qid
        assert len(W.words(d['text'])) <= W.MAX_WORDS
        if d['lang'] == 'ar':
            assert W.ARABIC.search(d['text'])
        else:
            assert not W.ARABIC.search(d['text'])


def test_repeated_words_are_told_apart_by_index():
    d = W.builtin()['ww_en06']               # "If I would have known, I would have called you earlier."
    toks = W.words(d['text'])
    assert toks.count('would') == 2 and d['wrong'] == 2
    t = W.task('q', d)
    other = len(toks) - 1 - toks[::-1].index('would')   # the second "would" is right
    assert E.correct(t, 2, [])[0] and not E.correct(t, other, [])[0]
    ar = W.builtin()['ww_ar09']              # the second الذي is the wrong one
    assert W.words(ar['text']).count('الذي') == 2 and ar['wrong'] == 7


def test_editing_the_sentence_stops_a_stale_answer_key():
    d = dict(W.builtin()['ww_en03'])
    d['text'] = 'Me and my brother went to the cinema last night.'
    errs = [m for lvl, m in W.validate(W.normalize(d)) if lvl == 'error']
    assert errs and 'Pick the incorrect word again' in errs[0]
    assert [m for lvl, m in W.validate(W.normalize(dict(lang='en', text='a b c d', wrong=None))) if lvl == 'error']


def test_wrong_word_rounds_use_the_room_language():
    for lang in ('ar', 'en'):
        for seed in range(40):
            tasks = E.gen_round([dict(id='a', name='a')], lang, rng=random.Random(seed))
            ww = [t for t in tasks if t['type'] == 'wrongword']
            assert len(ww) == 1 and ww[0]['lang'] == lang
            assert 0 <= ww[0]['answer'] < len(ww[0]['words'])


# ------------------------------------------------------------------ visual IQ

def test_every_starter_puzzle_has_exactly_one_checked_answer():
    b = Q.builtin()
    assert len(b) == len(Q.KINDS) * Q.STARTERS
    for qid, d in b.items():
        assert not [p for p in Q.problems(d) if p[0] == 'error'], (qid, Q.problems(d))
        assert Q.SOLVE[d['kind']](d['spec'], d['options']) == [d['answer']]


@pytest.mark.parametrize('kind', Q.KINDS)
def test_generated_puzzles_check_out(kind):
    for seed in range(15):
        d = Q.generate(kind, random.Random(seed))
        assert not [p for p in Q.problems(d) if p[0] == 'error']


@pytest.mark.parametrize('kind', Q.KINDS)
def test_a_wrong_answer_mark_is_refused(kind):
    d = copy.deepcopy(Q.builtin()[f'iq_{kind}_01'])
    d['answer'] = (d['answer'] + 1) % len(d['options'])
    assert [p for p in Q.problems(d) if p[0] == 'error']


def test_puzzles_that_would_have_two_answers_are_refused():
    d = copy.deepcopy(Q.builtin()['iq_fold_01'])
    d['options'][(d['answer'] + 1) % 4] = copy.deepcopy(d['options'][d['answer']])
    assert [p for p in Q.problems(d) if p[0] == 'error']
    m = copy.deepcopy(Q.builtin()['iq_match_01'])
    m['spec']['eq'] = '1+1=2'                      # already right
    assert [p for p in Q.problems(m) if p[0] == 'error']
    r = copy.deepcopy(Q.builtin()['iq_rotate_01'])
    r['spec']['cells'] = [[0, 0, 0], [1, 0, 1], [2, 0, 0], [1, 1, 0], [1, 2, 0]]   # a T, eye on its axis: same in a mirror
    assert [p for p in Q.problems(r) if p[0] == 'error']


def test_matchstick_moves():
    assert Q.moves('2-2=9', '2-2=0') == 1   # 9 -> 0: the middle stick moves to the bottom-left
    assert Q.moves('3+3=8', '3-3=0') is None  # plus loses its upright, 8 loses its middle: taken away, not moved
    assert Q.moves('8-3=5', '9-3=6') == 1   # the bottom-left stick of the 8 moves onto the 5, making 6
    assert Q.moves('6+2=8', '6+2=9') is None  # a stick taken away is not a move


def test_iq_task_shuffles_but_keeps_the_answer():
    for qid, d in Q.builtin().items():
        for seed in range(5):
            t = Q.task(qid, d, random.Random(seed))
            assert len(t['view']['options']) == len(d['options'])
            # the shown option at t['answer'] is the stored right one
            again = Q.VIEW[d['kind']](d['spec'], [d['options'][d['answer']]])['options'][0]
            assert t['view']['options'][t['answer']] == again


# ------------------------------------------------------------------ studio: new types, preview, delete

def test_studio_creates_previews_and_approves_the_new_types():
    s = C.empty_state()
    e = C.create(s, 'wrongword', dict(lang='en', text='The cat drink milk every day.', wrong=2), 'tester')
    assert C.validate('wrongword', e['draft']) == []
    t = C.preview_task('wrongword', e['draft'], {})
    assert t['words'][t['answer']] == 'drink'
    C.set_status(s, e['id'], 'approved', 'tester')
    iq = C.create(s, 'iq', dict(kind='overlap'), 'tester')
    assert iq['draft']['kind'] == 'overlap' and not [p for p in C.validate('iq', iq['draft']) if p['level'] == 'error']
    t = C.preview_task('iq', iq['draft'], {})
    assert t['type'] == 'iq' and 0 <= t['answer'] < len(t['view']['options'])
    bad = dict(iq['draft'], answer=(iq['draft']['answer'] + 1) % len(iq['draft']['options']))
    C.save_draft(s, iq['id'], bad, 'tester')
    with pytest.raises(ValueError):
        C.set_status(s, iq['id'], 'approved', 'tester')


def test_delete_is_permanent_for_studio_and_original_questions():
    s = C.empty_state()
    e = C.create(s, 'wrongword', dict(lang='en', text='The cat drink milk every day.', wrong=2), 'tester')
    assert C.delete(s, e['id'], 'tester') == 'wrongword' and e['id'] not in s['items']
    C.save_draft(s, 'ww_en01', dict(lang='en', text='edited one', wrong=0), 'tester')   # an edited original
    C.delete(s, 'ww_en01', 'tester')
    assert 'ww_en01' not in s['items'] and 'ww_en01' in s['deleted']
    assert 'ww_en01' not in C.all_ids(s) and C.view(s, 'ww_en01') is None
    assert all(r['id'] != 'ww_en01' for r in C.summary(s))
    with pytest.raises(KeyError):
        C.delete(s, 'ww_en01', 'tester')           # already gone
    with pytest.raises(KeyError):
        C.save_draft(s, 'ww_en01', dict(lang='en', text='back', wrong=0), 'tester')
    # after a "restart": a fresh live pool built from the saved state still leaves it out
    saved = C.dumps(s)
    live = C.Live()
    import json
    live.load(json.loads(saved))
    assert 'ww_en01' not in {q for q, _ in live.pool('wrongword')}
    assert 'ww_en02' in {q for q, _ in live.pool('wrongword')}   # nothing else went
    with pytest.raises(KeyError):
        C.delete(s, 'nope', 'tester')


def test_delete_never_empties_a_question_type():
    s = C.empty_state()
    ids = [q for q in C.all_ids(s) if C.view(s, q)['type'] == 'vote']
    with pytest.raises(ValueError):
        for q in ids:
            C.delete(s, q, 'tester')
    assert C.live_counts(s)['vote'] >= C.MIN_LIVE['vote']
    en = [q for q in C.all_ids(s) if q.startswith('ww_en')]
    with pytest.raises(ValueError):
        for q in en:
            C.delete(s, q, 'tester')
    assert sum(1 for q in C.all_ids(s) if q.startswith('ww_en')) >= 3


def _asset(s, aid):
    s['assets'][aid] = dict(id=aid, url=f'/api/clock-race/asset/{aid}/player.webp', thumb='', original=None)
    return f'asset:{aid}'


def test_picture_delete_keeps_questions_and_refuses_live_pictures():
    s = C.empty_state()
    ref = _asset(s, 'ab12cd34ef')
    a = C.create(s, 'animal', dict(key=ref, ar='قط', en='Cat'), 'tester')
    b = C.create(s, 'animal', dict(key=ref, ar='نمر', en='Tiger'), 'tester')
    other = _asset(s, 'ff00ff00ff')
    c = C.create(s, 'animal', dict(key=other, ar='أسد', en='Lion'), 'tester')
    assert {u['id'] for u in C.asset_usage(s, 'ab12cd34ef')} == {a['id'], b['id']}
    with pytest.raises(ValueError):                 # shared: needs confirming
        C.delete_asset(s, 'ab12cd34ef', 'tester')
    record, cleared = C.delete_asset(s, 'ab12cd34ef', 'tester', confirm=True)
    assert set(cleared) == {a['id'], b['id']} and 'ab12cd34ef' not in s['assets']
    assert a['id'] in s['items'] and b['id'] in s['items']           # the questions stay
    assert s['items'][a['id']]['draft']['key'] == ''                  # and say "picture missing"
    assert any('Picture missing' in p['msg'] for p in C.validate('animal', s['items'][a['id']]['draft'], s['assets']))
    assert s['items'][c['id']]['draft']['key'] == other               # nothing else touched
    # a picture players see now can't be deleted
    s['items'][c['id']].update(status='approved', approved=dict(s['items'][c['id']]['draft']),
                               published=dict(s['items'][c['id']]['draft']), published_status='approved')
    with pytest.raises(ValueError):
        C.delete_asset(s, 'ff00ff00ff', 'tester', confirm=True)
    assert 'ff00ff00ff' in s['assets']
    with pytest.raises(KeyError):
        C.delete_asset(s, 'ab12cd34ef', 'tester', confirm=True)


def test_unused_picture_deletes_without_confirming():
    s = C.empty_state()
    _asset(s, '0123456789')
    C.delete_asset(s, '0123456789', 'tester')
    assert '0123456789' not in s['assets']


# ------------------------------------------------------------------ catch-up gamble

def _room(n=3):
    g, host = E.new_room('Khaled')
    others = [E.add_player(g, f'P{i}') for i in range(n - 1)]
    E.start(g, '', now=0)
    return g, [host] + others


def _walk(g, pid, n, t=10.0):
    rid = g['round']['id']
    for _ in range(n):
        i = len(g['progress'][pid])
        task = g['round']['tasks'][i]
        r = E.answer(g, pid, rid, i, E.solve(task, E.vote_choices(g, task, pid)), now=t + E.reached_at(g, pid, i))
        assert r['right'], r


def _wrong(task):
    return 'zzzzz' if task['type'] == 'word' else -99


@pytest.fixture
def gamble_on(monkeypatch):
    monkeypatch.setattr(E, 'GAMBLE_ON', True)
    monkeypatch.setattr(E, 'GAMBLE_AT', 16)


def test_gamble_is_off_by_default():
    assert E.GAMBLE_ON is False
    g, (a, b, c) = _room()
    _walk(g, a['id'], 18)
    assert not g.get('gamble')
    assert E.view(g, b['id'])['gamble'] is None
    assert E.gamble_action(g, b['id'], 'accept', g['round']['id'], 'x')['reason'] == 'off'


def test_gamble_offered_once_to_those_behind_only(gamble_on):
    g, (a, b, c) = _room()
    _walk(g, c['id'], 15)                    # close behind: not offered
    _walk(g, a['id'], 16)
    assert set(g['gamble']) == {b['id']}
    _walk(g, a['id'], 1)
    assert set(g['gamble']) == {b['id']}     # no second wave
    v = E.view(g, b['id'], now=g['gamble'][b['id']]['expires'] - 1)['gamble']
    assert v['state'] == 'offered'
    assert E.view(g, b['id'], now=g['gamble'][b['id']]['expires'] + 1)['gamble']['state'] == 'expired'


def test_gamble_win_jumps_to_the_milestone_and_never_touches_the_leader(gamble_on):
    g, (a, b, c) = _room()
    _walk(g, a['id'], 16)
    lead = copy.deepcopy(g['progress'][a['id']])
    o = g['gamble'][b['id']]
    now = o['expires'] - 4
    assert E.gamble_action(g, b['id'], 'accept', g['round']['id'], o['id'], now=now)['ok']
    assert not E.gamble_action(g, b['id'], 'decline', g['round']['id'], o['id'], now=now)['changed']
    i = len(g['progress'][b['id']])
    task = g['round']['tasks'][i]
    r = E.answer(g, b['id'], g['round']['id'], i, E.solve(task, E.vote_choices(g, task, b['id'])), now=now + 1)
    assert r['gamble'] == 'won' and r['done'] == 16 == len(g['progress'][b['id']])
    assert sum(ok for _, ok in g['progress'][b['id']]) == 1   # skipped tasks never count as right
    assert g['progress'][a['id']] == lead
    i = len(g['progress'][b['id']])               # the next answer is an ordinary one again
    task = g['round']['tasks'][i]
    r = E.answer(g, b['id'], g['round']['id'], i, E.solve(task, E.vote_choices(g, task, b['id'])), now=now + 5)
    assert 'gamble' not in r and r['done'] == 17


def test_gamble_loss_resets_to_zero(gamble_on):
    g, (a, b, c) = _room()
    _walk(g, b['id'], 5)
    _walk(g, a['id'], 16)
    o = g['gamble'][b['id']]
    now = o['expires'] - 4
    E.gamble_action(g, b['id'], 'accept', g['round']['id'], o['id'], now=now)
    i = len(g['progress'][b['id']])
    r = E.answer(g, b['id'], g['round']['id'], i, _wrong(g['round']['tasks'][i]), now=now + 1)
    assert r['gamble'] == 'lost' and r['reset'] and g['progress'][b['id']] == []
    assert E.lives(g, b['id'])['epoch'] == 1


def test_gamble_decline_and_late_accept(gamble_on):
    g, (a, b, c) = _room()
    _walk(g, a['id'], 16)
    ob, oc = g['gamble'][b['id']], g['gamble'][c['id']]
    assert E.gamble_action(g, b['id'], 'decline', g['round']['id'], ob['id'], now=ob['expires'] - 1)['ok']
    assert not E.gamble_action(g, b['id'], 'accept', g['round']['id'], ob['id'], now=ob['expires'] - 1)['ok']
    assert not E.gamble_action(g, c['id'], 'accept', g['round']['id'], oc['id'], now=oc['expires'] + 1)['ok']
    assert not E.gamble_action(g, c['id'], 'accept', g['round']['id'], 'forged', now=oc['expires'] - 1)['ok']


def test_gamble_never_rides_on_the_friend_question(gamble_on):
    g, (a, b, c) = _room()
    _walk(g, b['id'], E.VOTE_AT)                 # b now faces the friend question
    _walk(g, a['id'], 16)
    o = g['gamble'][b['id']]
    E.gamble_action(g, b['id'], 'accept', g['round']['id'], o['id'], now=o['expires'] - 4)
    assert o['task'] == E.VOTE_AT + 1


def test_a_reset_before_the_gamble_question_voids_it(gamble_on):
    g, (a, b, c) = _room()
    _walk(g, a['id'], 16)
    o = g['gamble'][b['id']]
    now = o['expires'] - 4
    E.gamble_action(g, b['id'], 'accept', g['round']['id'], o['id'], now=now)
    E._reset(g, b['id'], now)
    t = now + 5
    i = len(g['progress'][b['id']])
    task = g['round']['tasks'][i]
    r = E.answer(g, b['id'], g['round']['id'], i, E.solve(task, E.vote_choices(g, task, b['id'])), now=t)
    assert 'gamble' not in r and r['done'] == 1 and o['state'] == 'void'
