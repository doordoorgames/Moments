"""Clock Race (سباق الساعة): 1-12 players race through the same 20 quick tasks.

The server builds the whole round once, so every phone sees the same tasks in the same order,
and it alone decides whether an answer is right and who reached 100% first.

Every answer moves the player on: a right answer straight away, a wrong one after a one-second
pause. The clock fills by tasks answered; the results also show how many were right.

Round shape: task 11 is always the friend question and task 20 the final boss (the repeated
face). The other 18 mix the sad face, the missing letter, Stroop colours, geography, the lonely
sock and the three-grid memory with 1-2 Word Rush tasks, never the same type twice in a row.
"""
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
WRONG_DELAY = 1.0  # a wrong answer holds the player this long before the next task
GRACE = 0.25     # network slack on the server-side waits
NAME_MAX = 24
ORDINARY_MIX = {'odd': 3, 'missing': 3, 'stroop': 3, 'geo': 3, 'sock': 3, 'memory': 2}  # 17; one fewer with 2 Word Rush
WORD_VARIANTS = ('pair', 'country', 'fruit')
TYPO_MIN_LENGTH = 5  # one-typo forgiveness only for words this long or longer
TEST_BOT = 'Test Bot'
BOT_NAMES = ['نورة', 'سارة', 'فهد', 'دانة', 'عبدالله', 'شوق', 'يوسف', 'مريم', 'Noor', 'Hamad', 'لولوة', 'بدر']
# Simulated players: typical seconds per task type (measured feel: taps ~2-3s, typing ~7s,
# memory = 6s of grids + the answer). Each task varies 0.7x-1.35x and ~12% are "wrong" (+1s).
BOT_SECONDS = {'odd': 2.4, 'missing': 3.2, 'stroop': 2.2, 'geo': 2.6, 'sock': 3.4, 'memory': 8.6,
               'word': 7.5, 'vote': 2.0, 'boss': 5.5}
BOT_WRONG = 0.12


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

def gen_odd(rng, lang):
    rows, cols = rng.choice([(4, 4), (4, 5), (5, 5), (5, 6), (6, 5), (6, 6)])
    return dict(type='odd', rows=rows, cols=cols, odd=rng.randrange(rows * cols), color=rng.randrange(D.FACE_COLORS))


def gen_missing(rng, lang):
    alphabet = D.ALPHABETS[lang]
    letter = alphabet[rng.choice(D.EDITABLE[lang])]
    choices = rng.sample([c for c in alphabet if c != letter], 3) + [letter]
    rng.shuffle(choices)
    return dict(type='missing', letters=[c for c in alphabet if c != letter], choices=choices, answer=letter)


def _derangement(items, rng):
    while True:
        out = list(items)
        rng.shuffle(out)
        if all(a != b for a, b in zip(items, out)):
            return out


def gen_stroop(rng, lang, mode=None):
    """Four words, four inks, never a word in its own colour. 'word' asks for the written word,
    'color' for the ink. The other half of each pair is always on screen as the trap."""
    colors = rng.sample(D.STROOP_COLORS, 4)
    inks = _derangement(colors, rng)
    target = rng.choice(colors)
    mode = mode or rng.choice(['word', 'color'])
    answer = colors.index(target) if mode == 'word' else inks.index(target)
    return dict(type='stroop', mode=mode, target=target, choices=[dict(word=w, ink=i) for w, i in zip(colors, inks)], answer=answer)


def gen_geo(rng, lang, variant=None):
    """Pick the one place of the asked kind (country / city / continent / US state) among four
    named pictures. The other three are of other kinds."""
    variant = variant or rng.choice(['country', 'city', 'continent'])
    by_kind = {}
    for key, kind in D.GEO.items():
        by_kind.setdefault(kind, []).append(key)
    while True:
        target = rng.choice(by_kind[variant])
        others = [k for k in by_kind if k not in (variant, 'state')]
        # three distractors of other kinds; Texas joins now and then (the classic trap for "country")
        kinds = others + (['state'] if variant != 'state' and rng.random() < 0.35 else [rng.choice(others)])
        if len(kinds) < 3:
            kinds += [rng.choice(others) for _ in range(3 - len(kinds))]
        kinds = kinds[:3]
        picks = []
        for kind in kinds:
            pool = [k for k in by_kind[kind] if k not in picks]
            picks.append(rng.choice(pool))
        items = [target] + picks
        if any((a, b) in D.GEO_SAME_PLACE or (b, a) in D.GEO_SAME_PLACE for a in items for b in items):
            continue
        if sum(D.GEO[k] == variant for k in items) != 1:
            continue
        rng.shuffle(items)
        return dict(type='geo', variant=variant, items=items, answer=items.index(target))


def gen_sock(rng, lang):
    """Nine socks: four pairs and one lonely sock. Designs come from a small shared palette so
    the socks look alike; every two designs still differ."""
    colors = rng.sample(range(D.SOCK_COLORS), 2)
    patterns = rng.sample(range(D.SOCK_PATTERNS), 3)
    accents = rng.sample(range(D.SOCK_ACCENTS), 2)
    space = [f'{c}-{p}-{a}' for c in colors for p in patterns for a in accents]
    designs = rng.sample(space, 5)
    lone = designs[0]
    socks = [d for d in designs[1:] for _ in range(2)] + [lone]
    rng.shuffle(socks)
    return dict(type='sock', socks=socks, answer=socks.index(lone))


def memory_counts(grids):
    counts = {}
    for grid in grids:
        for s in set(grid):
            counts[s] = counts.get(s, 0) + 1
    return counts


def gen_memory(rng, lang, kind=None, ask=None):
    """Three 3x3 grids shown two seconds each, then one question. Counts are by grid (a symbol
    is never twice in one grid). Built so exactly one symbol answers the question."""
    kind = kind or rng.choice(['number', 'letter'])
    ask = ask or rng.choice(['all', 'twice'])
    pool = list(D.MEMORY_POOLS['number' if kind == 'number' else f'letter_{lang}'])
    while True:
        rng.shuffle(pool)
        if ask == 'all':
            answer, rest = pool[0], pool[1:]
            g1 = [answer] + rng.sample(rest, 8)
            g2 = [answer] + rng.sample(rest, 8)
            both = set(g1) & set(g2)
            g3 = [answer] + rng.sample([s for s in rest if s not in both], 8)
            grids = [g1, g2, g3]
        else:
            triples, answer, singles = pool[:3], pool[3], pool[4:]
            with_answer = rng.sample(range(3), 2)
            grids, i = [], 0
            for g in range(3):
                need = 9 - 3 - (1 if g in with_answer else 0)
                grids.append(triples + ([answer] if g in with_answer else []) + singles[i:i + need])
                i += need
        for g in grids:
            rng.shuffle(g)
        counts = memory_counts(grids)
        want = 3 if ask == 'all' else 2
        right = [s for s, n in counts.items() if n == want]
        if right != [answer] and sorted(right) != [answer]:
            continue
        # distractors: things that were on screen but not the answer (the near-misses first)
        near = [s for s, n in counts.items() if s != answer and n == (2 if ask == 'all' else 3)]
        far = [s for s, n in counts.items() if s != answer and n == 1]
        rng.shuffle(near)
        rng.shuffle(far)
        distract = (near[:2] + far)[:3]
        choices = distract + [answer]
        rng.shuffle(choices)
        return dict(type='memory', kind=kind, ask=ask, grids=grids, choices=choices, answer=answer)


def gen_word(rng, lang, variant):
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
    keys = {'odd': ('rows', 'cols', 'odd'), 'missing': ('answer',), 'stroop': ('mode', 'target', 'choices'),
            'geo': ('variant', 'items'), 'sock': ('socks',), 'memory': ('grids',),
            'word': ('variant', 'first', 'last', 'letter'), 'vote': ('question',), 'boss': ('faces',)}[t['type']]
    return repr((t['type'],) + tuple(repr(t.get(k)) for k in keys))


def plan_types(rng):
    """The 20 task types: vote at 11, boss at 20, 1-2 Word Rush, the rest from ORDINARY_MIX,
    never the same type twice in a row (and no face task right before the face boss)."""
    words = rng.choice([1, 2])
    mix = dict(ORDINARY_MIX)
    if words == 2:
        mix[rng.choice(['sock', 'odd', 'stroop'])] -= 1
    pool = [k for k, n in mix.items() for _ in range(n)] + ['word'] * words
    while True:
        rng.shuffle(pool)
        it = iter(pool)
        types = ['vote' if i == VOTE_AT else 'boss' if i == BOSS_AT else next(it) for i in range(TASKS)]
        if all(types[i] != types[i - 1] for i in range(1, TASKS)) and types[BOSS_AT - 1] != 'odd':
            return types


def gen_round(roster, lang='ar', avoid_question=None, rng=None, avoid=()):
    rng = rng or random.SystemRandom()
    types = plan_types(rng)
    variants = rng.sample(WORD_VARIANTS, types.count('word'))
    # spread the variations: both Stroop modes, different geography kinds (Texas at most once)
    stroop_modes = iter(rng.sample(['word', 'color', 'word', 'color'], 4))
    geo_kinds = ['country', 'city', 'continent']
    if rng.random() < 0.4:
        geo_kinds[rng.randrange(3)] = 'state'  # "tap the US state": Texas, about two rounds in five
    rng.shuffle(geo_kinds)
    geo_kinds = iter(geo_kinds)
    tasks, seen = [], set(avoid)
    for kind in types:
        for _ in range(200):
            if kind == 'odd':
                t = gen_odd(rng, lang)
            elif kind == 'missing':
                t = gen_missing(rng, lang)
            elif kind == 'stroop':
                t = gen_stroop(rng, lang, next(stroop_modes, None))
            elif kind == 'geo':
                t = gen_geo(rng, lang, next(geo_kinds, None))
            elif kind == 'sock':
                t = gen_sock(rng, lang)
            elif kind == 'memory':
                t = gen_memory(rng, lang)
            elif kind == 'word':
                t = gen_word(rng, lang, variants[len([x for x in tasks if x['type'] == 'word'])])
            elif kind == 'vote':
                t = gen_vote(rng, roster, avoid_question)
            else:
                t = gen_boss(rng)
            if signature(t) not in seen:
                break
        seen.add(signature(t))
        tasks.append(t)
    return tasks


# ------------------------------------------------------------------ answers

def correct(task, answer, roster_ids):
    """Server-side judgement. Returns (right, extra) where extra is the accepted word for Word Rush."""
    kind = task['type']
    try:
        if kind == 'odd':
            return int(answer) == task['odd'], None
        if kind in ('missing', 'memory'):
            return answer == task['answer'], None
        if kind in ('stroop', 'geo', 'sock'):
            return int(answer) == task['answer'], None
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
    """A right answer for a task (developer rooms)."""
    kind = task['type']
    if kind == 'odd':
        return task['odd']
    if kind in ('missing', 'memory', 'stroop', 'geo', 'sock'):
        return task['answer']
    if kind == 'vote':
        return roster_ids[0]
    if kind == 'boss':
        return task['faces'].index(task['answer'])
    pool = word_candidates(task)
    return sorted(pool.values(), key=len)[0]


def show_time(task):
    """Seconds a task is on screen before an answer may count (the memory grids)."""
    return D.MEMORY_SHOW * D.MEMORY_GRIDS if task['type'] == 'memory' else 0.0


# ------------------------------------------------------------------ rooms

def clean_name(name):
    name = ' '.join(str(name or '').split())[:NAME_MAX]
    if not name:
        raise GameError('Enter your name first. · اكتب اسمك أول.')
    return name


def _player(name, sim=False):
    return dict(id=str(uuid.uuid4()), token=secrets.token_urlsafe(32), name=name, sim=sim, color=0)


def new_room(nickname, lang='ar'):
    if lang not in D.LANGS:
        lang = 'ar'
    name = clean_name(nickname)
    dev = name.upper() == 'TEST99'
    host = _player(name)
    g = dict(v=VERSION, lang=lang, host=host['id'], dev=dev, status='lobby', players=[host], round=None,
             roster=[], progress={}, bots={}, winner=None, last_question=None, rounds=0, ended_at=None, seen=[])
    if dev:
        add_player(g, TEST_BOT, sim=True)  # TEST99: one simulated opponent, ready to start
    return g, host


def _next_color(g):
    used = {p['color'] for p in g['players']}
    return next((c for c in range(MAX_PLAYERS) if c not in used), len(g['players']) % MAX_PLAYERS)


def add_player(g, nickname, sim=False):
    if len(g['players']) >= MAX_PLAYERS:
        raise GameError(f'Room is full ({MAX_PLAYERS}). · الغرفة فل ({MAX_PLAYERS} لاعب).')
    p = _player(clean_name(nickname), sim)
    p['color'] = _next_color(g)
    g['players'].append(p)
    return p


def authenticate(g, pid, token):
    for p in g['players']:
        if p['id'] == pid and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError('Your session could not be verified.')


def bot_schedule(tasks, rng):
    """Seconds after the start at which a simulated player finishes each task, and whether it
    got that one right. Built once per round, so its clock moves at a human pace on its own."""
    out, t = [], 0.0
    for task in tasks:
        t += BOT_SECONDS[task['type']] * rng.uniform(0.7, 1.35)
        ok = task['type'] == 'vote' or rng.random() > BOT_WRONG
        out.append([round(t, 2), ok])
        if not ok:
            t += WRONG_DELAY
    return out


def start(g, round_id, now=None, rng=None):
    """Host starts the first round or the next one. `round_id` is the round the host was
    looking at ('' in the lobby), so a double tap never starts two rounds."""
    now = time.time() if now is None else now
    rng = rng or random.SystemRandom()
    current = g['round']['id'] if g['round'] else ''
    if round_id != current or g['status'] == 'racing':
        return False
    roster = [dict(id=p['id'], name=p['name']) for p in g['players']]
    tasks = gen_round(roster, g['lang'], g['last_question'], rng, g.get('seen', []))
    g['seen'] = (g.get('seen', []) + [signature(t) for t in tasks if t['type'] in ('memory', 'sock', 'stroop', 'geo')])[-120:]
    g['last_question'] = tasks[VOTE_AT]['question']
    g['round'] = dict(id=uuid.uuid4().hex[:12], tasks=tasks, starts_at=now + COUNTDOWN)
    g['roster'] = roster
    g['progress'] = {p['id']: [] for p in roster}  # per task: [seconds after start, right?]
    g['bots'] = {p['id']: bot_schedule(tasks, rng) for p in g['players'] if p['sim']}
    g['status'] = 'racing'
    g['winner'] = None
    g['ended_at'] = None
    g['rounds'] += 1
    return True


def _finish(g, pid, at):
    if g['winner'] is None and g['status'] == 'racing':
        g['winner'] = pid  # the first completion the server records wins; ties go to arrival order
        g['status'] = 'finished'
        g['ended_at'] = at


def sync_bots(g, now=None):
    """Move every simulated player along its schedule up to `now`. Returns True if anything moved.
    Runs on every request, so bots keep the right pace even if no phone is watching."""
    now = time.time() if now is None else now
    if g['status'] != 'racing' or not g.get('bots'):
        return False
    start_at, moved, finishes = g['round']['starts_at'], False, []
    for pid, plan in g['bots'].items():
        done = g['progress'].get(pid)
        if done is None:
            continue
        while len(done) < len(plan) and start_at + plan[len(done)][0] <= now:
            done.append(list(plan[len(done)]))
            moved = True
        if len(done) == TASKS:
            finishes.append((done[-1][0], pid))
    # a bot that crossed the line between two requests wins at its own finish time, not at the request
    humans_done = [(v[-1][0], pid) for pid, v in g['progress'].items() if len(v) == TASKS and pid not in g['bots']]
    for at, pid in sorted(finishes + humans_done):
        _finish(g, pid, start_at + at)
        break
    return moved


def reached_at(g, pid, index):
    """When this player's task `index` appeared on the server's clock."""
    done = g['progress'][pid]
    if index == 0 or not done:
        return g['round']['starts_at']
    t, ok = done[index - 1]
    return g['round']['starts_at'] + t + (0.0 if ok else WRONG_DELAY)


def answer(g, pid, round_id, index, value, now=None):
    """One answer from one player. Right or wrong, it moves the player on.
    Returns dict(right, done, word, changed[, wait])."""
    now = time.time() if now is None else now
    sync_bots(g, now)
    done = g['progress'].get(pid)
    if g['round'] is None or round_id != g['round']['id'] or done is None:
        raise GameError('This round is over. · هالجولة خلصت.')
    count = len(done)
    if index < count:
        return dict(right=done[index][1], done=count, word=None, changed=False)  # repeat: already counted
    if g['status'] != 'racing' or index > count:
        return dict(right=False, done=count, word=None, changed=False)
    task = g['round']['tasks'][index]
    ready = reached_at(g, pid, index) + show_time(task) - GRACE
    if now < ready:
        return dict(right=False, done=count, word=None, changed=False, wait=round(ready - now + 0.05, 2))
    right, word = correct(task, value, [p['id'] for p in g['roster']])
    done.append([round(max(0.0, now - g['round']['starts_at']), 3), bool(right)])
    if len(done) == TASKS:
        _finish(g, pid, now)
    return dict(right=bool(right), done=len(done), word=word, changed=True)


def progress(g):
    """The public race picture every phone may see."""
    return dict(status=g['status'], round=g['round']['id'] if g['round'] else None, winner=g['winner'],
                players=[dict(id=p['id'], done=len(g['progress'].get(p['id'], [])),
                              right=sum(1 for _, ok in g['progress'].get(p['id'], []) if ok)) for p in g['players']])


def timing(g):
    """Developer rooms only: average seconds each task type took (people only, not bots)."""
    if not g['round']:
        return {}
    tasks, sums = g['round']['tasks'], {}
    for pid, marks in g['progress'].items():
        if pid in g.get('bots', {}):
            continue
        previous = 0.0
        for i, (t, ok) in enumerate(marks):
            kind = tasks[i]['type'] + (':' + tasks[i]['variant'] if tasks[i]['type'] == 'word' else '')
            sums.setdefault(kind, []).append(t - previous)
            previous = t + (0.0 if ok else WRONG_DELAY)
    return {k: dict(avg=round(sum(v) / len(v), 2), n=len(v)) for k, v in sorted(sums.items())}


def view(g, pid, now=None):
    now = time.time() if now is None else now
    r = g['round']
    in_race = {p['id'] for p in g['roster']}
    lang_i = 0 if g['lang'] == 'ar' else 1
    return dict(
        v=VERSION, me=pid, host=g['host'], dev=g['dev'], lang=g['lang'], status=g['status'], winner=g['winner'],
        now=now, tasks_total=TASKS, wrong_delay=WRONG_DELAY,
        players=[dict(id=p['id'], name=p['name'], color=p['color'], sim=p['sim'], racing=p['id'] in in_race,
                      done=len(g['progress'].get(p['id'], [])),
                      right=sum(1 for _, ok in g['progress'].get(p['id'], []) if ok)) for p in g['players']],
        round=dict(id=r['id'], starts_at=r['starts_at'], tasks=r['tasks'],
                   question=D.QUESTIONS[r['tasks'][VOTE_AT]['question']][lang_i]) if r else None,
        roster=g['roster'],
        # bot finish times (seconds after the start), so every phone can move the bot's clock smoothly
        bots={b: [t for t, _ in plan] for b, plan in g.get('bots', {}).items()} if r else {},
        timing=timing(g) if g['dev'] else None,
    )
