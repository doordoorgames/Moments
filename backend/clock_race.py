"""Clock Race (سباق الساعة): 1-12 players race through the same 20 quick tasks.

The server builds the whole round once, so every phone sees the same tasks in the same order,
and it alone decides whether an answer is right and who reached 100% first.

Round shape: tasks 1-10 and 12-19 mix the ordinary tasks (sad face, missing letter, Stroop
colors, geography, lonely sock, three-grid memory) with 1-2 Word Rush tasks, never the same type
twice in a row; task 11 is always the friend question; task 20 is always the final boss (the
repeated face).

Every answer moves the player on. A right answer counts; a wrong one is recorded as a miss and
costs WRONG_DELAY seconds (the sad face) before the next answer is accepted. The first player
through all 20 tasks wins; the results also show how many each player got right.

TEST99 rooms come with one simulated opponent ("Test Bot") whose finishing times are planned
when the race starts and applied from the server clock, so it keeps pace even while the host's
phone sleeps.
"""
import hashlib
import random
import secrets
import time
import unicodedata
import uuid

import clock_race_data as D

VERSION = 2
MAX_PLAYERS = 12
TASKS = 20
VOTE_AT = 10    # task 11 (0-based)
BOSS_AT = 19    # task 20
COUNTDOWN = 3.0  # seconds between START and the first tap counting, so every phone starts together
NAME_MAX = 24
ORDINARY = ('odd', 'missing', 'stroop', 'geo', 'sock', 'memory')
ORDINARY_COUNT = {'odd': 3, 'missing': 3, 'stroop': 3, 'geo': 3, 'sock': 3, 'memory': 2}  # 17 = 18 slots - 1 word
WRONG_DELAY = 1.0      # seconds the sad face shows after a wrong answer
EARLY_SLACK = 0.4      # network jitter allowed against WRONG_DELAY
MEMORY_SHOW = 6.0      # three grids x 2 seconds before the question appears
MEMORY_SLACK = 1.5     # network jitter allowed against MEMORY_SHOW
TEST_BOT = 'Test Bot'
# Average seconds an ordinary player spends on each task (Test Bot pace; tuned against the
# TEST99 timing table). Each step varies by -25%..+30%, and about one task in eight is a miss.
BOT_PACE = {'odd': 3.0, 'missing': 3.5, 'stroop': 3.0, 'geo': 3.0, 'sock': 4.0, 'memory': 9.0,
            'word': 8.0, 'vote': 2.5, 'boss': 7.0}
WORD_VARIANTS = ('pair', 'country', 'fruit')
TYPO_MIN_LENGTH = 5  # one-typo forgiveness only for words this long or longer
BOT_NAMES = ['نورة', 'سارة', 'فهد', 'دانة', 'عبدالله', 'شوق', 'يوسف', 'مريم', 'Noor', 'Hamad', 'لولوة', 'بدر']


class GameError(ValueError):
    pass


# ------------------------------------------------------------------ English answers

def compact(text):
    """Lowercase letters only: accents dropped, spaces, punctuation and digits removed."""
    text = unicodedata.normalize('NFKD', str(text or '')).lower()
    return ''.join(c for c in text if 'a' <= c <= 'z')


def within_one(a, b):
    """Levenshtein distance <= 1 (one missing, extra or changed letter)."""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la > lb:
        a, b, la, lb = b, a, lb, la
    i = 0
    while i < la and a[i] == b[i]:
        i += 1
    if la == lb:
        return a[i + 1:] == b[i + 1:]
    return a[i:] == b[i + 1:]


def _table(entries):
    """{compact spelling: display name} for every name and alias."""
    out = {}
    for name, aliases in entries.items():
        for spelling in [name] + aliases:
            out[compact(spelling)] = spelling
    return out


COUNTRY_TABLE = _table(D.COUNTRIES)
FRUIT_TABLE = _table(D.FRUITS)


def word_candidates(task):
    """Every accepted answer for a Word Rush task: {compact: display}."""
    if task['variant'] == 'pair':
        first, last = task['first'].lower(), task['last'].lower()
        return {w: w.upper() for w in D.WORDS if w[0] == first and w[-1] == last}
    table = COUNTRY_TABLE if task['variant'] == 'country' else FRUIT_TABLE
    letter = task['letter'].lower()
    return {k: v for k, v in table.items() if k.startswith(letter)}


def check_word(task, text):
    """(accepted, display answer or None). The typed text itself must meet the letter rule,
    so typo forgiveness can never change the first or last letter."""
    typed = compact(text)
    if len(typed) < 2:
        return False, None
    if task['variant'] == 'pair':
        if typed[0] != task['first'].lower() or typed[-1] != task['last'].lower() or len(typed) < 3:
            return False, None
    elif typed[0] != task['letter'].lower():
        return False, None
    pool = word_candidates(task)
    if typed in pool:
        return True, pool[typed]
    if len(typed) < TYPO_MIN_LENGTH:
        return False, None
    near = {display for k, display in pool.items() if within_one(typed, k) and len(k) >= TYPO_MIN_LENGTH - 1}
    if len(near) == 1:
        return True, near.pop()
    if near and task['variant'] == 'pair':
        # "browze" is one letter from both BROWSE and BRONZE. Either one fits the letters, so the
        # answer is right whichever was meant. For countries and fruits an unclear typo is rejected.
        return True, sorted(near)[0]
    return False, None  # no match, or ambiguous between two names


# ------------------------------------------------------------------ task generators

def gen_odd(rng):
    rows, cols = rng.choice([(4, 4), (4, 5), (5, 5), (5, 6), (6, 5), (6, 6)])
    return dict(type='odd', rows=rows, cols=cols, odd=rng.randrange(rows * cols), color=rng.randrange(D.FACE_COLORS))


def gen_missing(rng):
    gone = rng.choice(D.EDITABLE)
    letter = D.ALPHABET[gone]
    others = [c for c in D.ALPHABET if c != letter]
    choices = rng.sample(others, 3) + [letter]
    rng.shuffle(choices)
    return dict(type='missing', letters=[c for c in D.ALPHABET if c != letter], choices=choices, answer=letter)


def gen_stroop(rng, variant=None):
    """Four color words, each printed in a different ink than it says.
    variant 'word': tap the word that SAYS the target color (its ink is something else).
    variant 'ink':  tap the word PRINTED in the target color (it says something else).
    The asked dimension is distinct across the four choices, so exactly one matches; one other
    choice always matches the target on the other dimension, so reading the wrong way fails."""
    variant = variant or rng.choice(['word', 'ink'])
    n = len(D.STROOP_COLORS)
    target = rng.randrange(n)
    while True:
        primary = [target] + rng.sample([c for c in range(n) if c != target], 3)
        secondary = [rng.choice([c for c in range(n) if c != p]) for p in primary]
        if target not in secondary[1:] or len(set(zip(primary, secondary))) < 4:
            continue
        order = list(range(4))
        rng.shuffle(order)
        pairs = [(primary[i], secondary[i]) for i in order]
        choices = [dict(word=p, ink=s) if variant == 'word' else dict(word=s, ink=p) for p, s in pairs]
        return dict(type='stroop', variant=variant, target=target, choices=choices, answer=order.index(0))


def stroop_matches(task, i):
    return task['choices'][i][task['variant']] == task['target']


def gen_geo(rng, variant=None):
    """Four pictures (map silhouettes, landmarks, the Texas outline), names shown underneath;
    exactly one belongs to the asked category."""
    variant = variant or rng.choice(['country', 'city', 'continent', 'country', 'city', 'continent', 'state'])
    answer_key = rng.choice(D.GEO[variant])
    others = [(cat, k) for cat, keys in D.GEO.items() if cat != variant for k in keys]
    picks = rng.sample(others, 3)
    items = [dict(key=answer_key, cat=variant)] + [dict(key=k, cat=c) for c, k in picks]
    rng.shuffle(items)
    return dict(type='geo', variant=variant, items=items, answer=[i['key'] for i in items].index(answer_key))


def _socks(rng, count):
    """`count` sock designs, every two differing in at least two of base / pattern / accent."""
    every = [(b, p, a) for b in range(D.SOCK_BASES) for p in range(D.SOCK_PATTERNS) for a in range(D.SOCK_ACCENTS)]
    while True:
        rng.shuffle(every)
        chosen = []
        for f in every:
            if all(sum(x != y for x, y in zip(f, g)) >= 2 for g in chosen):
                chosen.append(f)
                if len(chosen) == count:
                    return [f'{b}-{p}-{a}' for b, p, a in chosen]


def gen_sock(rng):
    """Four identical pairs and one lonely sock, nine in all, shuffled. One tap: the lonely one."""
    designs = _socks(rng, 5)
    socks = designs[:4] * 2 + designs[4:]
    rng.shuffle(socks)
    tilts = [rng.choice([-9, -6, -3, 3, 6, 9]) for _ in socks]
    return dict(type='sock', socks=socks, tilts=tilts, answer=socks.index(designs[4]))


def memory_counts(grids):
    """How many of the three grids each symbol is in. Symbols never repeat inside one grid, so
    'appeared twice' means the same thing whether you count grids or cells."""
    out = {}
    for grid in grids:
        for sym in set(grid):
            out[sym] = out.get(sym, 0) + 1
    return out


def memory_matches(task, sym):
    want = 3 if task['question'] == 'all' else 2
    return memory_counts(task['grids']).get(sym) == want


def gen_memory(rng, kind=None, question=None):
    """Three 3x3 grids shown two seconds each, then one question with four choices.
    question 'all':   exactly one symbol is in all three grids; two decoys are in exactly two.
    question 'twice': exactly one symbol is in exactly two grids; one decoy is in all three.
    Every other symbol is in one grid only. Built by construction, then checked."""
    kind = kind or rng.choice(['letters', 'numbers'])
    question = question or rng.choice(['all', 'twice'])
    pool = list(D.MEMORY_LETTERS if kind == 'letters' else D.MEMORY_NUMBERS)
    rng.shuffle(pool)
    if question == 'all':
        answer, d2a, d2b = pool[:3]
        placed = {answer: [0, 1, 2], d2a: rng.sample(range(3), 2), d2b: rng.sample(range(3), 2)}
        decoys = [d2a, d2b]
    else:
        answer, d3 = pool[:2]
        placed = {answer: rng.sample(range(3), 2), d3: [0, 1, 2]}
        decoys = [d3]
    grids = [[s for s, where in placed.items() if g in where] for g in range(3)]
    singles = iter(pool[len(placed):])
    for grid in grids:
        while len(grid) < 9:
            grid.append(next(singles))
        rng.shuffle(grid)
    shown_once = [s for g in grids for s in g if s not in placed]
    choices = [answer] + decoys + rng.sample(shown_once, 4 - 1 - len(decoys))
    rng.shuffle(choices)
    task = dict(type='memory', kind=kind, question=question, grids=grids, choices=choices, answer=answer)
    assert [c for c in choices if memory_matches(task, c)] == [answer]
    assert all(len(set(g)) == 9 for g in grids)
    return task


def gen_word(rng, variant):
    if variant == 'pair':
        pair = rng.choice(D.LETTER_PAIRS)
        return dict(type='word', variant='pair', first=pair[0], last=pair[1])
    letters = D.COUNTRY_LETTERS if variant == 'country' else D.FRUIT_LETTERS
    return dict(type='word', variant=variant, letter=rng.choice(letters))


def gen_vote(rng, roster, avoid=None):
    options = [i for i in range(len(D.QUESTIONS)) if i != avoid] or list(range(len(D.QUESTIONS)))
    order = [p['id'] for p in roster]
    rng.shuffle(order)
    return dict(type='vote', question=rng.choice(options), order=order)


def _faces(rng, count):
    """`count` faces, every two differing in at least two of eyes / mouth / color."""
    every = [(e, m, c) for e in range(D.EYES) for m in range(D.MOUTHS) for c in range(D.FACE_COLORS)]
    while True:
        rng.shuffle(every)
        chosen = []
        for f in every:
            if all(sum(x != y for x, y in zip(f, g)) >= 2 for g in chosen):
                chosen.append(f)
                if len(chosen) == count:
                    return [f'{e}-{m}-{c}' for e, m, c in chosen]


def gen_boss(rng):
    rows, cols = 5, 4
    unique = _faces(rng, rows * cols - 1)
    twin = rng.choice(unique)
    faces = unique + [twin]
    rng.shuffle(faces)
    return dict(type='boss', rows=rows, cols=cols, faces=faces, answer=twin)


def signature(t):
    keys = {'odd': ('rows', 'cols', 'odd'), 'missing': ('answer',), 'stroop': ('variant', 'target', 'choices'),
            'geo': ('variant', 'items'), 'sock': ('socks',), 'memory': ('grids',),
            'word': ('variant', 'first', 'last', 'letter'), 'vote': ('question',), 'boss': ('faces',)}[t['type']]
    return repr((t['type'],) + tuple(repr(t.get(k)) for k in keys))


def memory_key(t):
    """Short fingerprint of a memory task's grids, remembered per room so they never come back."""
    return hashlib.sha1(repr(t['grids']).encode()).hexdigest()[:12]


def plan_types(rng):
    """The 20 task types: vote at 11, boss at 20, 1-2 Word Rush, the ordinary types spread
    (3 each, memory 2; one dropped when there are two Word Rush tasks), never the same type twice
    in a row."""
    slots = [i for i in range(TASKS) if i not in (VOTE_AT, BOSS_AT)]
    words = rng.choice([1, 2])
    pool = [k for k, n in ORDINARY_COUNT.items() for _ in range(n)]
    if words == 2:
        pool.remove(rng.choice([k for k in ORDINARY_COUNT if ORDINARY_COUNT[k] == 3]))
    while True:
        rest = pool + ['word'] * words
        rng.shuffle(rest)
        it = iter(rest)
        types = ['vote' if i == VOTE_AT else 'boss' if i == BOSS_AT else next(it) for i in range(TASKS)]
        if all(types[i] != types[i - 1] for i in range(1, TASKS)):
            assert len(slots) == len(rest)
            return types


def gen_round(roster, avoid_question=None, rng=None, avoid=()):
    """`avoid`: memory_key()s already played in this room (memory grids never come back)."""
    rng = rng or random.SystemRandom()
    types = plan_types(rng)
    variants = rng.sample(WORD_VARIANTS, types.count('word'))
    # Spread the variations: both Stroop readings, different geography categories.
    stroop = rng.sample(['word', 'ink'], 2) + [rng.choice(['word', 'ink'])] * 2
    geo = rng.sample(['country', 'city', 'continent'], 3)
    if rng.random() < .35:
        geo[rng.randrange(3)] = 'state'  # "which one is the state?" (Texas)
    geo.append(geo[0])
    tasks, seen, avoid = [], set(), set(avoid)
    for kind in types:
        while True:
            if kind == 'odd':
                t = gen_odd(rng)
            elif kind == 'missing':
                t = gen_missing(rng)
            elif kind == 'stroop':
                t = gen_stroop(rng, stroop[types[:len(tasks)].count('stroop') % 4])
            elif kind == 'geo':
                t = gen_geo(rng, geo[types[:len(tasks)].count('geo') % 4])
            elif kind == 'sock':
                t = gen_sock(rng)
            elif kind == 'memory':
                t = gen_memory(rng)
            elif kind == 'word':
                t = gen_word(rng, variants[len([x for x in tasks if x['type'] == 'word'])])
            elif kind == 'vote':
                t = gen_vote(rng, roster, avoid_question)
            else:
                t = gen_boss(rng)
            if signature(t) not in seen and (t['type'] != 'memory' or memory_key(t) not in avoid):
                seen.add(signature(t))
                tasks.append(t)
                break
    return tasks


# ------------------------------------------------------------------ answers

def correct(task, answer, roster_ids):
    """Server-side judgement. Returns (right, extra) where extra is the accepted word for Word Rush."""
    kind = task['type']
    try:
        if kind == 'odd':
            return int(answer) == task['odd'], None
        if kind == 'missing':
            return answer == task['answer'], None
        if kind == 'vote':
            return answer in roster_ids, None
        if kind in ('boss',):
            i = int(answer)
            return 0 <= i < len(task['faces']) and task['faces'][i] == task['answer'], None
        if kind == 'stroop':
            i = int(answer)
            return 0 <= i < 4 and stroop_matches(task, i), None
        if kind in ('geo', 'sock'):
            return int(answer) == task['answer'] and not isinstance(answer, bool), None
        if kind == 'memory':
            return isinstance(answer, str) and answer in task['choices'] and memory_matches(task, answer), None
        if kind == 'word':
            if not isinstance(answer, str) or len(answer) > 60:
                return False, None
            return check_word(task, answer)
    except (TypeError, ValueError):
        return False, None
    return False, None


def solve(task, roster_ids):
    """A right answer for a task (developer rooms and tests)."""
    kind = task['type']
    if kind == 'odd':
        return task['odd']
    if kind in ('missing', 'stroop', 'geo', 'sock', 'memory'):
        return task['answer']
    if kind == 'vote':
        return roster_ids[0]
    if kind == 'boss':
        return task['faces'].index(task['answer'])
    pool = word_candidates(task)
    return sorted(pool.values(), key=len)[0]


# ------------------------------------------------------------------ rooms

def clean_name(name):
    name = ' '.join(str(name or '').split())[:NAME_MAX]
    if not name:
        raise GameError('اكتب اسمك أول.')
    return name


def _player(name, sim=False):
    return dict(id=str(uuid.uuid4()), token=secrets.token_urlsafe(32), name=name, sim=sim, color=0)


def new_room(nickname):
    """A room with its host. A host named TEST99 (any case) opens a developer room that already
    holds one simulated opponent, so a race can start from a single phone."""
    name = clean_name(nickname)
    dev = name.upper() == 'TEST99'
    host = _player(name)
    g = dict(v=VERSION, host=host['id'], dev=dev, status='lobby', players=[host], round=None,
             roster=[], progress={}, misses={}, bot_plans={}, winner=None, last_question=None, rounds=0,
             ended_at=None, memory_seen=[])
    if dev:
        add_player(g, TEST_BOT, sim=True)['auto'] = True
    return g, host


def _next_color(g):
    used = {p['color'] for p in g['players']}
    return next((c for c in range(MAX_PLAYERS) if c not in used), len(g['players']) % MAX_PLAYERS)


def add_player(g, nickname, sim=False):
    if len(g['players']) >= MAX_PLAYERS:
        raise GameError(f'الغرفة فل ({MAX_PLAYERS} لاعب).')
    p = _player(clean_name(nickname), sim)
    p['color'] = _next_color(g)
    g['players'].append(p)
    return p


def authenticate(g, pid, token):
    for p in g['players']:
        if p['id'] == pid and not p.get('sim') and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError('Your session could not be verified.')


def bot_plan(tasks, rng):
    """Test Bot: seconds after the start at which it finishes each task, and whether it missed.
    Ordinary pace per task type with natural variation; a miss adds the sad-face second."""
    at, plan = 0.0, []
    for t in tasks:
        wrong = t['type'] != 'vote' and rng.random() < 0.12
        at += BOT_PACE[t['type']] * rng.uniform(0.75, 1.3) + (WRONG_DELAY if wrong else 0.0)
        plan.append([round(at, 3), wrong])
    return plan


def start(g, round_id, now=None, rng=None):
    """Host starts the first round or the next one. `round_id` is the round the host was
    looking at ('' in the lobby), so a double tap never starts two rounds."""
    now = time.time() if now is None else now
    rng = rng or random.SystemRandom()
    current = g['round']['id'] if g['round'] else ''
    if round_id != current:
        return False
    if g['status'] == 'racing':
        return False
    roster = [dict(id=p['id'], name=p['name']) for p in g['players']]
    seen = g.setdefault('memory_seen', [])
    tasks = gen_round(roster, g['last_question'], rng, avoid=seen)
    seen.extend(memory_key(t) for t in tasks if t['type'] == 'memory')
    del seen[:-400]  # 200 rounds of memory grids
    vote = tasks[VOTE_AT]
    g['last_question'] = vote['question']
    g['round'] = dict(id=uuid.uuid4().hex[:12], tasks=tasks, starts_at=now + COUNTDOWN)
    g['roster'] = roster
    g['progress'] = {p['id']: [] for p in roster}  # completion times (seconds after start) per task
    g['misses'] = {p['id']: [] for p in roster}    # task indexes answered wrong
    g['bot_plans'] = {p['id']: bot_plan(tasks, rng) for p in g['players'] if p.get('auto')}
    g['status'] = 'racing'
    g['winner'] = None
    g['ended_at'] = None
    g['rounds'] += 1
    return True


def _record(g, pid, right, now):
    """Move one player past their current task."""
    done = g['progress'][pid]
    if not right:
        g.setdefault('misses', {}).setdefault(pid, []).append(len(done))
    done.append(round(max(0.0, now - g['round']['starts_at']), 3))
    if len(done) == TASKS and g['winner'] is None:
        g['winner'] = pid  # the first completion the server records wins; ties go to arrival order
        g['status'] = 'finished'
        g['ended_at'] = now


def arrived(g, pid):
    """Seconds after the start at which this player's current task appeared on their phone."""
    done = g['progress'][pid]
    if not done:
        return 0.0
    return done[-1] + (WRONG_DELAY if len(done) - 1 in g.get('misses', {}).get(pid, []) else 0.0)


def answer(g, pid, round_id, index, value, now=None):
    """One answer from one player. Right or wrong, it moves them on (a wrong one is a miss).
    Returns dict(right, done, word, changed)."""
    now = time.time() if now is None else now
    done = g['progress'].get(pid)
    if g['round'] is None or round_id != g['round']['id'] or done is None:
        raise GameError('هالجولة خلصت.')
    count = len(done)
    if g['status'] != 'racing':
        return dict(right=False, done=count, word=None, changed=False)
    if now < g['round']['starts_at'] - 0.5:
        raise GameError('اصبر، العد التنازلي.')
    if index < count:
        return dict(right=index not in g.get('misses', {}).get(pid, []), done=count, word=None, changed=False)  # duplicate
    if index > count:
        return dict(right=False, done=count, word=None, changed=False)  # out of order: resync
    task = g['round']['tasks'][index]
    elapsed = now - g['round']['starts_at']
    shown = arrived(g, pid)
    if count and count - 1 in g.get('misses', {}).get(pid, []) and elapsed < shown - EARLY_SLACK:
        return dict(right=False, done=count, word=None, changed=False)  # still on the sad face: resync
    if task['type'] == 'memory' and elapsed < shown + MEMORY_SHOW - MEMORY_SLACK:
        return dict(right=False, done=count, word=None, changed=False)  # grids still showing: resync
    right, word = correct(task, value, [p['id'] for p in g['roster']])
    _record(g, pid, right, now)
    return dict(right=right, done=len(done), word=word, changed=True)


def sync_bots(g, now=None):
    """Apply every Test Bot step whose planned time has passed. Returns True if anyone moved."""
    now = time.time() if now is None else now
    if g['status'] != 'racing' or not g.get('bot_plans'):
        return False
    start_at = g['round']['starts_at']
    steps = []
    for pid, plan in g['bot_plans'].items():
        i = len(g['progress'].get(pid, []))
        while i < len(plan) and start_at + plan[i][0] <= now:
            steps.append((plan[i][0], pid, not plan[i][1]))
            i += 1
    moved = False
    for at, pid, right in sorted(steps):  # several bots: in time order, so the earliest finisher wins
        if g['status'] != 'racing':
            break
        _record(g, pid, right, start_at + at)
        moved = True
    return moved


def bots_step(g, now=None, rng=None):
    """Developer rooms: every hand-added test player (not Test Bot, which runs on its plan)
    moves 0-2 tasks, answering right."""
    rng = rng or random.SystemRandom()
    now = time.time() if now is None else now
    moved = False
    for p in g['players']:
        if not p['sim'] or p.get('auto') or p['id'] not in g['progress'] or g['status'] != 'racing':
            continue
        for _ in range(rng.choice([0, 1, 1, 2])):
            if len(g['progress'][p['id']]) >= TASKS or g['status'] != 'racing':
                break
            _record(g, p['id'], True, now)
            moved = True
    return moved


def _misses(g, pid):
    return len(g.get('misses', {}).get(pid, []))


def progress(g):
    """The public race picture every phone may see."""
    return dict(status=g['status'], round=g['round']['id'] if g['round'] else None, winner=g['winner'],
                players=[dict(id=p['id'], done=len(g['progress'].get(p['id'], [])),
                              right=len(g['progress'].get(p['id'], [])) - _misses(g, p['id'])) for p in g['players']])


def timing(g):
    """Developer rooms only: average seconds each task type took (sad-face second excluded)."""
    if not g['round']:
        return {}
    tasks, sums = g['round']['tasks'], {}
    for pid, times in g['progress'].items():
        previous, missed = 0.0, set(g.get('misses', {}).get(pid, []))
        for i, t in enumerate(times):
            kind = tasks[i]['type'] + (':' + tasks[i]['variant'] if tasks[i]['type'] == 'word' else '')
            sums.setdefault(kind, []).append(t - previous)
            previous = t + (WRONG_DELAY if i in missed else 0.0)
    return {k: dict(avg=round(sum(v) / len(v), 2), n=len(v)) for k, v in sorted(sums.items())}


def public_task(t):
    """What a phone needs to draw the task. Answers for tap tasks are visible by nature
    (the odd face is on screen); Word Rush answers stay on the server."""
    return {k: v for k, v in t.items() if not (t['type'] == 'word' and k == 'answer')}


def view(g, pid, now=None):
    now = time.time() if now is None else now
    r = g['round']
    in_race = {p['id'] for p in g['roster']}
    return dict(
        v=VERSION, me=pid, host=g['host'], dev=g['dev'], status=g['status'], winner=g['winner'],
        now=now, tasks_total=TASKS, wrong_delay=WRONG_DELAY, memory_show=MEMORY_SHOW,
        players=[dict(id=p['id'], name=p['name'], color=p['color'], sim=p['sim'], bot=bool(p.get('auto')),
                      racing=p['id'] in in_race, done=len(g['progress'].get(p['id'], [])),
                      right=len(g['progress'].get(p['id'], [])) - _misses(g, p['id'])) for p in g['players']],
        round=dict(id=r['id'], starts_at=r['starts_at'], tasks=[public_task(t) for t in r['tasks']],
                   question=D.QUESTIONS[r['tasks'][VOTE_AT]['question']],
                   question_en=D.QUESTIONS_EN[r['tasks'][VOTE_AT]['question']]) if r else None,
        roster=g['roster'],
        timing=timing(g) if g['dev'] else None,
    )
