"""Clock Race (سباق الساعة): 1-12 players race through the same 20 quick tasks.

The server builds the whole round once, so every phone sees the same tasks in the same order,
and it alone decides whether an answer is right and who reached 100% first.

Round shape: tasks 1-10 and 12-19 mix the ordinary tasks (odd face, missing letter, swapped
letters) with 1-2 Word Rush tasks; task 11 is always the friend question; task 20 is always
the final boss (the repeated face).
"""
import random
import secrets
import time
import unicodedata
import uuid

import clock_race_data as D

VERSION = 1
MAX_PLAYERS = 12
TASKS = 20
VOTE_AT = 10    # task 11 (0-based)
BOSS_AT = 19    # task 20
COUNTDOWN = 3.0  # seconds between START and the first tap counting, so every phone starts together
NAME_MAX = 24
ORDINARY = ('odd', 'missing', 'swap')
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


def gen_swap(rng):
    i, j = sorted(rng.sample(D.EDITABLE, 2))
    letters = list(D.ALPHABET)
    letters[i], letters[j] = letters[j], letters[i]
    return dict(type='swap', letters=letters, answer=[i, j])


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
    keys = {'odd': ('rows', 'cols', 'odd'), 'missing': ('answer',), 'swap': ('answer',),
            'word': ('variant', 'first', 'last', 'letter'), 'vote': ('question',), 'boss': ('faces',)}[t['type']]
    return repr((t['type'],) + tuple(repr(t.get(k)) for k in keys))


def plan_types(rng):
    """The 20 task types: vote at 11, boss at 20, 1-2 Word Rush, ordinary types balanced, no
    type more than twice in a row."""
    slots = [i for i in range(TASKS) if i not in (VOTE_AT, BOSS_AT)]
    words = rng.choice([1, 2])
    while True:
        word_at = set(rng.sample(slots, words))
        rest = len(slots) - words
        pool = [ORDINARY[i % 3] for i in range(rest)]
        rng.shuffle(pool)
        types, it = [], iter(pool)
        for i in range(TASKS):
            types.append('vote' if i == VOTE_AT else 'boss' if i == BOSS_AT else 'word' if i in word_at else next(it))
        if all(not (types[i] == types[i - 1] == types[i - 2]) for i in range(2, TASKS)):
            return types


def gen_round(roster, avoid_question=None, rng=None):
    rng = rng or random.SystemRandom()
    types = plan_types(rng)
    variants = rng.sample(WORD_VARIANTS, types.count('word'))
    tasks, seen = [], set()
    for kind in types:
        while True:
            if kind == 'odd':
                t = gen_odd(rng)
            elif kind == 'missing':
                t = gen_missing(rng)
            elif kind == 'swap':
                t = gen_swap(rng)
            elif kind == 'word':
                t = gen_word(rng, variants[len([x for x in tasks if x['type'] == 'word'])])
            elif kind == 'vote':
                t = gen_vote(rng, roster, avoid_question)
            else:
                t = gen_boss(rng)
            if signature(t) not in seen:
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
        if kind == 'swap':
            return sorted(int(x) for x in answer) == task['answer'] and len(answer) == 2, None
        if kind == 'vote':
            return answer in roster_ids, None
        if kind == 'boss':
            i = int(answer)
            return 0 <= i < len(task['faces']) and task['faces'][i] == task['answer'], None
        if kind == 'word':
            if not isinstance(answer, str) or len(answer) > 60:
                return False, None
            return check_word(task, answer)
    except (TypeError, ValueError):
        return False, None
    return False, None


def solve(task, roster_ids):
    """A right answer for a task (developer rooms and bots)."""
    kind = task['type']
    if kind == 'odd':
        return task['odd']
    if kind in ('missing', 'swap'):
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
    name = clean_name(nickname)
    dev = name.upper() == 'TEST99'
    host = _player(name)
    g = dict(v=VERSION, host=host['id'], dev=dev, status='lobby', players=[host], round=None,
             roster=[], progress={}, winner=None, last_question=None, rounds=0, ended_at=None)
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
        if p['id'] == pid and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError('Your session could not be verified.')


def start(g, round_id, now=None):
    """Host starts the first round or the next one. `round_id` is the round the host was
    looking at ('' in the lobby), so a double tap never starts two rounds."""
    now = time.time() if now is None else now
    current = g['round']['id'] if g['round'] else ''
    if round_id != current:
        return False
    if g['status'] == 'racing':
        return False
    roster = [dict(id=p['id'], name=p['name']) for p in g['players']]
    tasks = gen_round(roster, g['last_question'])
    vote = tasks[VOTE_AT]
    g['last_question'] = vote['question']
    g['round'] = dict(id=uuid.uuid4().hex[:12], tasks=tasks, starts_at=now + COUNTDOWN)
    g['roster'] = roster
    g['progress'] = {p['id']: [] for p in roster}  # completion times (seconds after start) per task
    g['status'] = 'racing'
    g['winner'] = None
    g['ended_at'] = None
    g['rounds'] += 1
    return True


def answer(g, pid, round_id, index, value, now=None):
    """One answer from one player. Returns dict(right, done, word, changed)."""
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
        return dict(right=True, done=count, word=None, changed=False)  # duplicate tap: already counted
    if index > count:
        return dict(right=False, done=count, word=None, changed=False)  # out of order: resync
    right, word = correct(g['round']['tasks'][index], value, [p['id'] for p in g['roster']])
    if not right:
        return dict(right=False, done=count, word=None, changed=False)
    done.append(round(max(0.0, now - g['round']['starts_at']), 3))
    if len(done) == TASKS and g['winner'] is None:
        g['winner'] = pid  # the first completion the server records wins; ties go to arrival order
        g['status'] = 'finished'
        g['ended_at'] = now
    return dict(right=True, done=len(done), word=word, changed=True)


def bots_step(g, now=None, rng=None):
    """Developer rooms: every test player in the race moves 0-2 tasks."""
    rng = rng or random.SystemRandom()
    now = time.time() if now is None else now
    ids = [p['id'] for p in g['roster']]
    moved = False
    for p in g['players']:
        if not p['sim'] or p['id'] not in g['progress'] or g['status'] != 'racing':
            continue
        for _ in range(rng.choice([0, 1, 1, 2])):
            i = len(g['progress'][p['id']])
            if i >= TASKS or g['status'] != 'racing':
                break
            answer(g, p['id'], g['round']['id'], i, solve(g['round']['tasks'][i], ids), now)
            moved = True
    return moved


def progress(g):
    """The public race picture every phone may see."""
    return dict(status=g['status'], round=g['round']['id'] if g['round'] else None, winner=g['winner'],
                players=[dict(id=p['id'], done=len(g['progress'].get(p['id'], []))) for p in g['players']])


def timing(g):
    """Developer rooms only: average seconds each task type took."""
    if not g['round']:
        return {}
    tasks, sums = g['round']['tasks'], {}
    for times in g['progress'].values():
        previous = 0.0
        for i, t in enumerate(times):
            kind = tasks[i]['type'] + (':' + tasks[i]['variant'] if tasks[i]['type'] == 'word' else '')
            sums.setdefault(kind, []).append(t - previous)
            previous = t
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
        now=now, tasks_total=TASKS,
        players=[dict(id=p['id'], name=p['name'], color=p['color'], sim=p['sim'], racing=p['id'] in in_race,
                      done=len(g['progress'].get(p['id'], []))) for p in g['players']],
        round=dict(id=r['id'], starts_at=r['starts_at'], tasks=[public_task(t) for t in r['tasks']],
                   question=D.QUESTIONS[r['tasks'][VOTE_AT]['question']]) if r else None,
        roster=g['roster'],
        timing=timing(g) if g['dev'] else None,
    )
