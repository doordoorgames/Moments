"""Clock Race (سباق الساعة): 1-12 players race through the same 20 quick tasks (TASKS).

The server builds the whole round once, so every phone sees the same tasks in the same order,
and it alone decides whether an answer is right and who reached 100% first.

Every answer moves the player on: a right answer straight away, a wrong one after a one-second
pause. The clock fills by tasks answered; the results also show how many were right.

Round shape: task 11 is always the friend question and task 20 the final boss (the repeated
face). The other 18 mix the sad face, Stroop colours, geography maps, the lonely sock and the
letter memory grid with 1-2 Word Rush tasks, spread so no type comes back within three tasks.
"""
import collections
import colorsys
import json
from pathlib import Path
import random
import secrets
import threading
import time
import unicodedata
import uuid

import clock_race_ar as AR
import clock_race_data as D
import clock_race_bank as K
import clock_race_content as C
from clock_race_landmarks import LANDMARK_BANK

PRICE_BANK = json.loads(Path(__file__).with_name('clock_race_prices.json').read_text(encoding='utf-8'))

VERSION = 8  # 8: 20 tasks, extra-life request
MAX_PLAYERS = 12
TASKS = 20
VOTE_AT = 10    # task 11 (0-based), only when 3+ people are racing
BOSS_AT = 19    # task 20
VOTE_MIN_HUMANS = 3
COUNTDOWN = 3.0  # seconds between START and the first tap counting, so every phone starts together
WRONG_DELAY = 1.0  # a wrong answer holds the player this long before the next task
LIVES = 3          # three hearts; losing the last sends the player's clock back to 0 (unless a friend gives a life)
RESET_DELAY = 1.6  # the heartbreak screen holds the player this long before task 1 again
GRACE = 0.25     # network slack on the server-side waits
NAME_MAX = 24
# 20 tasks = 7 picture comparisons + 13 of the original challenges (boss included, vote when 3+ people).
# Every question type still comes up each round; the bank itself is unchanged.
PICTURE_MIX = {'belong': 1, 'older': 1, 'compare': 1, 'price': 2, 'which': 1, 'photo': 1}
# "Tap the tiger" (type 'animal') is out of the rotation: too obvious. Its pictures stay in the studio.
ORDINARY_MIX = {'odd': 1, 'stroop': 1, 'geo': 1, 'sock': 1, 'memory': 1, 'avoid': 1,
                'alphabet': 1, 'scale': 1, 'shadow': 1, 'tile': 1}
RETIRED_TYPES = ('animal',)
# Extra-life request: a player out of hearts may ask the others once; the first YES gives both a heart.
DECIDE_SECONDS = 8.0    # time to choose "ask for a life" or "start over" before the clock resets anyway
HELP_SECONDS = 10.0     # how long the request stays open on the other phones
EXTRA_POOL = ['odd', 'stroop', 'avoid', 'sock', 'geo']  # fills the slot the vote or a 2nd Word Rush doesn't take
# The memory grid is the only letter challenge: 1 or 2 a round (half of v2's ~3 letter tasks).
WORD_VARIANTS = ('pair', 'country', 'fruit')
TYPO_MIN_LENGTH = 5  # one-typo forgiveness only for words this long or longer
TEST_BOT = 'Test Bot'
BOT_NAMES = ['نورة', 'سارة', 'فهد', 'دانة', 'عبدالله', 'شوق', 'يوسف', 'مريم', 'Noor', 'Hamad', 'لولوة', 'بدر']
# Simulated players: typical seconds per task type (measured feel: taps ~2-3s, typing ~7s,
# memory = 12s of grid + the answer). Each task varies 0.7x-1.35x and ~12% are "wrong" (+1s).
BOT_SECONDS = {'price': 4.0, 'alphabet': 2.2, 'odd': 2.4, 'stroop': 2.2, 'geo': 2.6, 'sock': 3.4, 'memory': 7.0,
               'word': 7.5, 'vote': 2.0, 'boss': 5.5, 'scale': 4.5, 'shadow': 3.0, 'tile': 3.0, 'avoid': 2.3,
               'belong': 3.8, 'older': 3.4, 'compare': 3.0, 'which': 3.4, 'animal': 2.2, 'photo': 4.5}
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
    if task.get('lang') == 'ar':
        return AR.candidates(task)
    if task['variant'] == 'pair':
        first, last = task['first'].lower(), task['last'].lower()
        return {w: w.upper() for w in D.WORDS if w[0] == first and w[-1] == last}
    table = COUNTRY_TABLE if task['variant'] == 'country' else FRUIT_TABLE
    letter = task['letter'].lower()
    return {k: v for k, v in table.items() if k.startswith(letter)}


def check_word(task, text):
    """(accepted, display answer or None). The typed text itself must meet the letter rule,
    so typo forgiveness can never change the first or last letter."""
    if task.get('lang') == 'ar':
        return AR.check(task, text)
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

ODD_MODES = [('sad', 'smile'), ('smile', 'sad'), ('smile', 'wink'), ('sad', 'tear')]  # (crowd, the different one)


def gen_odd(rng, lang, mode=None):
    """A grid of the same face with one different: a happy one among sad, a sad one among happy,
    a wink among happy, or a quiet tear (drawn in the eye colour) among sad."""
    rows, cols = rng.choice([(4, 4), (4, 5), (5, 5), (5, 6), (6, 5), (6, 6)])
    base, odd_mood = mode or rng.choice(ODD_MODES)
    return dict(type='odd', rows=rows, cols=cols, odd=rng.randrange(rows * cols), color=rng.randrange(D.FACE_COLORS),
                base=base, mood=odd_mood)


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


def gen_memory(rng, lang):
    """Remember this: nine different letters in a 3x3 grid, then "which letter was there?" with
    four choices: one from the grid, three that were not in it."""
    pool = D.MEMORY_LETTERS[lang]
    grid = rng.sample(pool, 9)
    answer = rng.choice(grid)
    choices = rng.sample([c for c in pool if c not in grid], 3) + [answer]
    rng.shuffle(choices)
    return dict(type='memory', grid=grid, choices=choices, answer=answer)


def gen_word(rng, lang, variant):
    if lang == 'ar':  # Arabic rooms: Arabic letters, Arabic answers (clock_race_ar)
        if variant == 'pair':
            first, last = rng.choice(AR.PAIR_LIST)
            return dict(type='word', variant='pair', lang='ar', first=first, last=last)
        letters = AR.COUNTRY_LETTERS if variant == 'country' else AR.FRUIT_LETTERS
        return dict(type='word', variant=variant, lang='ar', letter=rng.choice(letters))
    if variant == 'pair':
        pair = rng.choice(D.LETTER_PAIRS)
        return dict(type='word', variant='pair', first=pair[0], last=pair[1])
    letters = D.COUNTRY_LETTERS if variant == 'country' else D.FRUIT_LETTERS
    return dict(type='word', variant=variant, letter=rng.choice(letters))


def gen_vote(rng, roster, avoid=None):
    """The friend question: every person racing (no test bots); each phone hides its own name."""
    bank = C.vote_list() or [(f'v{i + 1:02d}', ar, en) for i, (ar, en) in enumerate(D.QUESTIONS)]
    options = [q for q in bank if q[0] != avoid] or bank
    order = [p['id'] for p in roster if not p.get('sim')]
    rng.shuffle(order)
    qid, ar, en = rng.choice(options)
    return dict(type='vote', question=qid, text=[ar, en], order=order)


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


# ------------------------------------------------------------------ v4: heaviest, shadow, missing tile

SCALE_STUFF = ['feathers', 'cotton', 'wood', 'sand', 'rice', 'stones', 'iron']
SCALE_EACH = [0.25, 0.5, 0.75, 1, 1.5, 2, 3]


def gen_scale(rng, lang):
    """Three groups of bags: how many bags, what is inside, the weight printed on each bag. The
    heaviest group is the one with the biggest total; light-sounding stuff often wins."""
    while True:
        stuff = rng.sample(SCALE_STUFF, 3)
        groups = [dict(stuff=s, count=rng.randint(1, 6), each=rng.choice(SCALE_EACH)) for s in stuff]
        totals = [g['count'] * g['each'] for g in groups]
        top = sorted(totals, reverse=True)
        if len(set(totals)) == 3 and 0.25 <= top[0] - top[1] <= 2 and top[0] <= 12:
            return dict(type='scale', groups=groups, answer=totals.index(top[0]))


def _norm(cells):
    mx, my = min(x for x, _ in cells), min(y for _, y in cells)
    return sorted((x - mx, y - my) for x, y in cells)


def _connected(cells):
    cells = set(cells)
    stack, seen = [next(iter(cells))], set()
    while stack:
        c = stack.pop()
        if c in seen:
            continue
        seen.add(c)
        x, y = c
        stack += [n for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)) if n in cells]
    return len(seen) == len(cells)


def _blob(rng, size, grid=4):
    cells = {(rng.randrange(grid), rng.randrange(grid))}
    while len(cells) < size:
        x, y = rng.choice(sorted(cells))
        n = rng.choice([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
        if 0 <= n[0] < grid and 0 <= n[1] < grid:
            cells.add(n)
    return sorted(cells)


def _nudge(rng, cells, grid=4):
    """The same shape with one block moved somewhere else (still one piece)."""
    for _ in range(100):
        out = set(cells)
        out.discard(rng.choice(cells))
        spots = [(x, y) for x in range(grid) for y in range(grid) if (x, y) not in out
                 and any(n in out for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))]
        out.add(rng.choice(spots))
        if _connected(out):
            return sorted(out)
    return None


def _rot(cells, k):
    """Turn a shape a quarter-turn clockwise k times (normalised to the top-left corner)."""
    out = [tuple(c) for c in cells]
    for _ in range(k % 4):
        out = [(-y, x) for x, y in out]
    return _norm(out)


def _turns(cells):
    """Every way the shape can be turned, as normalised shapes."""
    return {tuple(_rot(cells, k)) for k in range(4)}


def _dark_teal(rng):
    """A dark teal for a shadow: random depth, hue nudged a little bluer or a little yellower."""
    hue = (176 + rng.uniform(-16, 18)) / 360   # below 176 leans yellow-green, above leans blue
    light = rng.uniform(0.15, 0.27)
    sat = rng.uniform(0.32, 0.58)
    r, g, b = colorsys.hls_to_rgb(hue, light, sat)
    return '#%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))


def gen_shadow(rng, lang):
    """A block toy in colour and four dark shadows: its own, its mirror image, and two with one block
    moved. Every shadow is turned (90, 180 or 270 degrees), the right one included, so matching takes
    a mental turn; no wrong shadow can be turned into the toy. Every shape is new each round."""
    while True:
        cells = _blob(rng, rng.choice([6, 7]))
        mirror = sorted((3 - x, y) for x, y in cells)
        a, b = _nudge(rng, cells), _nudge(rng, cells)
        if not a or not b:
            continue
        options = [cells, mirror, a, b]
        families = [_turns(o) for o in options]
        # the wrong shadows must not be a turned copy of the toy, or of each other
        if any(families[i] & families[j] for i in range(4) for j in range(i + 1, 4)):
            continue
        toy = tuple(_norm(cells))
        turned = []
        for o in options:
            ks = [k for k in (1, 2, 3) if tuple(_rot(o, k)) != toy]
            turned.append(_rot(o, rng.choice(ks)))
        if tuple(turned[0]) == toy:  # fully symmetric shape: every turn looks the same, draw again
            continue
        colors = [rng.randrange(5) for _ in cells]
        shades = []
        while len(shades) < 4:
            c = _dark_teal(rng)
            if c not in shades:
                shades.append(c)
        order = list(range(4))
        rng.shuffle(order)
        return dict(type='shadow', cells=[list(c) for c in cells], colors=colors, shades=shades,
                    options=[[list(c) for c in turned[i]] for i in order], answer=order.index(0))


# Ten hand-picked pictures, each squared, its bottom-right third missing (public/clock-race/tiles/).
# Every option is the same real piece: the right one is only turned, never mirrored; the three decoys are
# mirrored (left-right "H" or top-bottom "V") and turned. Each set is checked so no two options look alike.
# Sets alternate between two mixes: A = 2 H + 1 V decoys, B = 1 H + 2 V decoys.
TILE_SET = {
    'p01': [('none', 270), ('V', 180), ('H', 180), ('H', 90)],
    'p02': [('none', 270), ('H', 90), ('V', 90), ('V', 180)],
    'p03': [('none', 90), ('H', 180), ('H', 270), ('V', 270)],
    'p04': [('none', 270), ('V', 90), ('V', 180), ('H', 180)],
    'p05': [('none', 180), ('H', 270), ('H', 180), ('V', 270)],
    'p06': [('none', 180), ('V', 180), ('H', 180), ('V', 270)],
    'p07': [('none', 90), ('H', 90), ('H', 270), ('V', 180)],
    'p08': [('none', 90), ('V', 270), ('H', 180), ('V', 180)],
    'p09': [('none', 270), ('H', 180), ('V', 180), ('H', 270)],
    'p10': [('none', 90), ('V', 90), ('H', 180), ('V', 270)],
}


# Server-wide deck of puzzle pictures: every picture comes up once before any comes back, in a fresh
# random order each time round, and never the same picture twice in a row (across rooms and rounds).
_TILE_DECK = []
_TILE_LAST = [None]
_LOCK = threading.Lock()


def _draw_tile(rng, tiles=None):
    tiles = tiles if tiles is not None else TILE_SET
    with _LOCK:
        # pictures taken out of the live set (rejected in the studio) never come up again
        _TILE_DECK[:] = [p for p in _TILE_DECK if p in tiles]
        if not _TILE_DECK:
            deck = sorted(tiles)
            rng.shuffle(deck)
            if deck[-1] == _TILE_LAST[0]:  # the deck is popped from the end
                deck[0], deck[-1] = deck[-1], deck[0]
            _TILE_DECK.extend(deck)
        pic = _TILE_DECK.pop()
        _TILE_LAST[0] = pic
        return pic


def gen_tile(rng, lang):
    """A picture with its bottom-right corner missing and four copies of that piece to pick from:
    the real one turned, three mirrored and turned. The options are shuffled on every draw."""
    tiles = C.tile_set() or {p: dict(pic=p, opts=o, img=None, piece=None) for p, o in TILE_SET.items()}
    tid = _draw_tile(rng, tiles)
    tile = tiles[tid]
    opts = [list(o) for o in tile['opts']]
    rng.shuffle(opts)
    task = dict(type='tile', pic=tile['pic'], opts=opts, answer=next(i for i, o in enumerate(opts) if o[0] == 'none'))
    if tile.get('img'):  # made in the studio: the game loads these urls instead of /clock-race/tiles/
        task.update(img=tile['img'], piece=tile['piece'])
        if tile.get('grid') == 2:
            task['grid'] = 2  # a quarter missing instead of a third
    return task


def signature(t):
    keys = {'price': ('qid',), 'alphabet': ('letters',), 'odd': ('rows', 'cols', 'odd', 'base', 'mood'), 'stroop': ('mode', 'target', 'choices'),
            'geo': ('variant', 'items'), 'sock': ('socks',), 'memory': ('grid',),
            'word': ('variant', 'first', 'last', 'letter'), 'vote': ('question',), 'boss': ('faces',),
            'scale': ('groups',), 'shadow': ('cells',), 'tile': ('pic',), 'avoid': ('rule', 'target', 'items'),
            'belong': ('qid',), 'older': ('qid',), 'compare': ('qid',), 'which': ('qid',), 'animal': ('options',), 'photo': ('qid',)}[t['type']]
    return repr((t['type'],) + tuple(repr(t.get(k)) for k in keys))


AVOID_COLORS = ['blue', 'green', 'red', 'yellow']
AVOID_SHAPES = ['circle', 'square', 'triangle', 'star']


def gen_avoid(rng, lang, rule=None):
    """Nine buttons in colours and shapes, and one rule: "don't tap the blue ones" or "don't tap
    anything circular". Most buttons break the rule; tapping any one that doesn't is right.
    The forbidden colour comes in every shape (and the forbidden shape in every colour) as the trap."""
    rule = rule or rng.choice(['color', 'shape'])
    pool = AVOID_COLORS if rule == 'color' else AVOID_SHAPES
    target = rng.choice(pool)
    bad = rng.randint(5, 7)
    items = []
    for i in range(9):
        c, sh = rng.choice(AVOID_COLORS), rng.choice(AVOID_SHAPES)
        if rule == 'color':
            c = target if i < bad else rng.choice([x for x in AVOID_COLORS if x != target])
        else:
            sh = target if i < bad else rng.choice([x for x in AVOID_SHAPES if x != target])
        items.append([c, sh])
    rng.shuffle(items)
    key = 0 if rule == 'color' else 1
    safe = [i for i, it in enumerate(items) if it[key] != target]
    return dict(type='avoid', rule=rule, target=target, items=items, safe=safe)


# ------------------------------------------------------------------ picture comparisons (question bank)
TWO_LAYOUTS = ['pair', 'vs', 'panels']
FOUR_LAYOUTS = ['board', 'table']


def gen_picture(rng, kind, used=(), seen=()):
    """One question from the bank: never twice in a round, and not one from recent rounds while
    fresh ones are left. Answer positions are shuffled; the fact stays on the server."""
    bank = C.picture_bank(kind)
    pool = [x for x in bank if x['id'] not in used] or list(bank)
    last = {q: i for i, q in enumerate(seen)}  # seen is oldest first
    fresh = [x for x in pool if x['id'] not in last]
    if fresh:
        x = rng.choice(fresh)
    else:
        # everything has been seen lately: take one of the longest-unseen quarter, never a recent one
        pool.sort(key=lambda q: last[q['id']])
        x = rng.choice(pool[:max(1, len(pool) // 4)])
    options = [list(o) for o in x['options']]
    right = options[0][0]
    rng.shuffle(options)
    layout = rng.choice(FOUR_LAYOUTS if len(options) == 4 else TWO_LAYOUTS)
    return dict(type=kind, qid=x['id'], ar=x['ar'], en=x['en'], options=options,
                answer=[o[0] for o in options].index(right), layout=layout)


def gen_animal(rng, lang):
    """Four painted animals; tap the one named."""
    animals = C.animal_list()
    picks = rng.sample(animals if len(animals) >= 4 else K.ANIMALS, 4)
    target = picks[0]
    rng.shuffle(picks)
    return dict(type='animal', target=list(target), options=[list(a) for a in picks],
                answer=picks.index(target), layout=rng.choice(FOUR_LAYOUTS))


# ------------------------------------------------------------------ photo questions
# Real photos. "ask": the photo and the question together. "recall": the photo alone (remember it,
# tap Next), then the question with the photo gone. The first option is the right one.
PHOTO_BANK = [
    dict(id='photo_bigben', pic='bigben', mode='ask', landmark='bigben',
         ar='في أي دولة هذه الساعة؟', en='In what country is this clock?',
         options=[['إنجلترا', 'England'], ['ألمانيا', 'Germany'], ['أمريكا', 'America'], ['الإمارات', 'United Arab Emirates']]),
    dict(id='photo_car', pic='car', mode='recall',
         ar='ما لون السيارة؟', en='What color was the car?',
         options=[['أزرق', 'Blue'], ['أحمر', 'Red'], ['بنفسجي', 'Purple'], ['برتقالي', 'Orange']]),
    dict(id='photo_chair', pic='chair', mode='recall',
         ar='ما لون الكرسي؟', en='What color was the chair?',
         options=[['أخضر', 'Green'], ['أسود', 'Black'], ['أبيض', 'White'], ['أصفر', 'Yellow']]),
]
PHOTO_BANK.extend(LANDMARK_BANK)


def gen_photo(rng, used=(), seen=()):
    """One photo question, never twice in a round, preferring ones not seen lately."""
    # The older Big Ben question and the landmark variant depict the same place.
    bank = C.photo_bank() or PHOTO_BANK
    used_landmarks = {q.get('landmark') for q in bank if q['id'] in used} - {None}
    pool = [q for q in bank if q['id'] not in used
            and q.get('landmark') not in used_landmarks]
    if not pool:
        raise ValueError('Photo question bank exhausted for this round')
    last = {qid: i for i, qid in enumerate(seen)}
    oldest = min(last.get(q['id'], -1) for q in pool)
    q = rng.choice([q for q in pool if last.get(q['id'], -1) == oldest])
    opts = [list(o) for o in q['options']]
    right = opts[0]
    rng.shuffle(opts)
    return dict(type='photo', qid=q['id'], pic=q['pic'], mode=q['mode'], ar=q['ar'], en=q['en'],
                options=opts, answer=opts.index(right))


# Picture questions served lately on this server, any room: a new room doesn't start from scratch.
_RECENT_Q = collections.deque(maxlen=80)

def gen_alphabet(rng, lang):
    alphabet = 'أبتثجحخدذرزسشصضطظعغفقكلمنهوي' if lang == 'ar' else 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    positions = rng.sample(range(len(alphabet)), 2)
    return dict(type='alphabet', letters=[alphabet[i] for i in positions], answer=positions.index(max(positions)))


NEW_GENS = {'alphabet': gen_alphabet, 'animal': gen_animal, 'avoid': gen_avoid, 'scale': gen_scale, 'shadow': gen_shadow, 'tile': gen_tile}
ANSWER_KINDS = ('price', 'alphabet', 'stroop', 'geo', 'sock', 'scale', 'shadow', 'tile', 'animal', 'photo') + K.KINDS

SPREAD = 3      # a type never comes back within 3 tasks
OPENING = 5     # the first five tasks are five different challenges


def plan_types(rng, vote=True):
    """The TASKS (20) task types: PICTURE_MIX and ORDINARY_MIX, the boss last, the friend vote at
    VOTE_AT when 3+ people race, then 1-2 Word Rush and EXTRA_POOL fill what is left.
    Variety first: the opening five are all different, a type never repeats within SPREAD tasks,
    and no face task right before the face boss."""
    mix = dict(ORDINARY_MIX)
    mix.update(PICTURE_MIX)
    for k in RETIRED_TYPES:
        mix.pop(k, None)
    room = (TASKS - 1 - (1 if vote else 0)) - sum(mix.values())
    assert room >= 1, 'the mixes leave no slot for Word Rush'
    words = rng.choice([1, min(2, room)])
    mix['word'] = words
    extra = room - words
    for k in rng.sample(EXTRA_POOL, extra):
        mix[k] += 1
    fixed = {BOSS_AT: 'boss'}
    if vote:
        fixed[VOTE_AT] = 'vote'
    while True:
        left, types, ok = dict(mix), [], True
        for i in range(TASKS):
            if i in fixed:
                types.append(fixed[i])
                continue
            recent = types[max(0, i - SPREAD + 1):]
            options = [k for k, n in left.items() if n and k not in recent
                       and not (i < OPENING and k in types)
                       and not (i == BOSS_AT - 1 and k == 'odd')]
            if not options:
                ok = False
                break
            # weight by what is left so the big piles get spread out instead of bunching at the end
            k = rng.choices(options, weights=[left[o] for o in options])[0]
            left[k] -= 1
            types.append(k)
        if ok:
            return types


def gen_round(roster, lang='ar', avoid_question=None, rng=None, avoid=(), seen_q=()):
    rng = rng or random.SystemRandom()
    humans = sum(1 for p in roster if not p.get('sim'))
    types = plan_types(rng, vote=humans >= VOTE_MIN_HUMANS)
    variants = rng.sample(WORD_VARIANTS, types.count('word'))
    # spread the variations: both Stroop modes, different geography kinds (Texas at most once)
    stroop_modes = iter(rng.sample(['word', 'color', 'word', 'color'], 4))
    geo_kinds = ['country', 'city', 'continent', rng.choice(['country', 'city', 'continent'])]
    if rng.random() < 0.4:
        geo_kinds[rng.randrange(4)] = 'state'  # "tap the US state": Texas, about two rounds in five
    rng.shuffle(geo_kinds)
    geo_kinds = iter(geo_kinds)
    odd_modes = list(ODD_MODES)
    rng.shuffle(odd_modes)
    odd_modes = iter(odd_modes * 2)
    tasks, seen = [], set(avoid)
    for kind in types:
        for _ in range(200):
            if kind == 'odd':
                t = gen_odd(rng, lang, next(odd_modes, None))
            elif kind == 'stroop':
                t = gen_stroop(rng, lang, next(stroop_modes, None))
            elif kind == 'geo':
                t = gen_geo(rng, lang, next(geo_kinds, None))
            elif kind == 'sock':
                t = gen_sock(rng, lang)
            elif kind == 'memory':
                t = gen_memory(rng, lang)
            elif kind == 'price':
                used = {task.get('qid') for task in tasks}
                bank = C.price_bank() or PRICE_BANK
                pool = [q for q in bank if q['id'] not in used] or bank
                last = {qid: i for i, qid in enumerate(seen_q)}
                oldest = min(last.get(q['id'], -1) for q in pool)
                q = rng.choice([q for q in pool if last.get(q['id'], -1) == oldest])
                opts = rng.sample(q['options'], len(q['options']))
                answer = max(range(len(opts)), key=lambda i: opts[i]['unit_usd'] * opts[i]['quantity'])
                public = [{k: o[k] for k in ('key', 'ar', 'en', 'unit_usd', 'quantity', 'img') if k in o} for o in opts]
                t = dict(type='price', qid=q['id'], options=public, answer=answer)
            elif kind in K.KINDS:
                t = gen_picture(rng, kind, {x.get('qid') for x in tasks}, seen_q)
            elif kind == 'photo':
                t = gen_photo(rng, {x.get('qid') for x in tasks if x['type'] == 'photo'}, seen_q)
            elif kind == 'avoid':
                t = gen_avoid(rng, lang, ['color', 'shape'][sum(x['type'] == 'avoid' for x in tasks) % 2])
            elif kind in NEW_GENS:
                t = NEW_GENS[kind](rng, lang)
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
        if kind == 'memory':
            return answer == task['answer'], None
        if kind == 'avoid':
            return int(answer) in task['safe'], None
        if kind in ANSWER_KINDS:
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
    if kind == 'avoid':
        return task['safe'][0]
    if kind == 'memory' or kind in ANSWER_KINDS:
        return task['answer']
    if kind == 'vote':
        return roster_ids[0]
    if kind == 'boss':
        return task['faces'].index(task['answer'])
    pool = word_candidates(task)
    return sorted(pool.values(), key=len)[0]


def show_time(task):
    """Seconds a task must stay on screen before an answer may count. None now: the memory grid
    stays up until the player taps Next, so every player controls their own time."""
    return 0.0


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


def vote_text(task, lang_i):
    """The friend question's text: carried by the task (studio era) or an index into D.QUESTIONS (older rounds)."""
    if task.get('text'):
        return task['text'][lang_i]
    q = task.get('question')
    return D.QUESTIONS[q][lang_i] if isinstance(q, int) and 0 <= q < len(D.QUESTIONS) else ''


def start(g, round_id, now=None, rng=None):
    """Host starts the first round or the next one. `round_id` is the round the host was
    looking at ('' in the lobby), so a double tap never starts two rounds."""
    now = time.time() if now is None else now
    rng = rng or random.SystemRandom()
    current = g['round']['id'] if g['round'] else ''
    if round_id != current or g['status'] == 'racing':
        return False
    roster = [dict(id=p['id'], name=p['name'], sim=bool(p['sim'])) for p in g['players']]
    with _LOCK:
        recent_q = list(_RECENT_Q)
    room_q = g.get('seen_q', [])
    # the server's recent questions (any room) first, then this room's own, so the room's count as newest
    seen_q = [q for q in recent_q if q not in set(room_q)] + room_q
    tasks = gen_round(roster, g['lang'], g['last_question'], rng, g.get('seen', []), seen_q)
    new_q = [t['qid'] for t in tasks if t.get('qid')]
    g['seen_q'] = (room_q + new_q)[-110:]
    with _LOCK:
        _RECENT_Q.extend(new_q)
    g['seen'] = (g.get('seen', []) + [signature(t) for t in tasks if t['type'] in ('memory', 'avoid') + ANSWER_KINDS])[-120:]
    if tasks[VOTE_AT]['type'] == 'vote':
        g['last_question'] = tasks[VOTE_AT]['question']
    g['round'] = dict(id=uuid.uuid4().hex[:12], tasks=tasks, starts_at=now + COUNTDOWN)
    g['roster'] = roster
    g['progress'] = {p['id']: [] for p in roster}  # per task: [seconds after start, right?]
    g['lives'] = {p['id']: _fresh_life() for p in roster}
    g['thanks'] = None
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
        return g['round']['starts_at'] + lives(g, pid)['reset_at']
    t, ok = done[index - 1]
    return g['round']['starts_at'] + t + (0.0 if ok else WRONG_DELAY)


def vote_choices(g, task, pid):
    """Who a player may pick: in the friend question everyone racing except themselves."""
    if task['type'] == 'vote':
        return [i for i in task['order'] if i != pid]
    return [p['id'] for p in g['roster']]


def _fresh_life():
    # bonus: hearts given by the extra-life request (no cap); out: waiting on "ask for a life" / a friend
    return dict(misses=0, epoch=0, reset_at=0.0, bonus=0, out=None)


def lives(g, pid):
    life = g.setdefault('lives', {}).setdefault(pid, _fresh_life())
    life.setdefault('bonus', 0)
    life.setdefault('out', None)
    return life


def max_hearts(life):
    return LIVES + life.get('bonus', 0)


def _reset(g, pid, now):
    """Out of hearts with no rescue: the clock goes back to task 1 with three full hearts."""
    life = lives(g, pid)
    at = round(max(0.0, now - g['round']['starts_at']), 3)
    g['progress'][pid].clear()
    life.update(misses=0, bonus=0, out=None, epoch=life['epoch'] + 1, reset_at=at + RESET_DELAY)


def helpers(g, pid):
    """Who could give `pid` a life: the other people in the race (not test bots) who are not out themselves."""
    return [p['id'] for p in g['roster']
            if p['id'] != pid and not p.get('sim') and not lives(g, p['id']).get('out')
            and len(g['progress'].get(p['id'], [])) < TASKS]


def sync_help(g, now=None):
    """Close what has run out of time: an unanswered choice or a request nobody accepted resets that
    player's clock (the normal loss). Returns True if anything changed."""
    now = time.time() if now is None else now
    if g.get('status') != 'racing' or not g.get('round'):
        return False
    changed = False
    for pid, life in list(g.get('lives', {}).items()):
        out = life.get('out')
        if not out:
            continue
        req = out.get('help')
        deadline = req['expires'] if req else out['decide_by']
        everyone_said_no = bool(req) and not [h for h in helpers(g, pid) if h not in req['declined']]
        if now >= deadline or everyone_said_no or (not req and not helpers(g, pid)):
            _reset(g, pid, now)
            changed = True
    return changed


def life_action(g, pid, action, round_id, request_id=None, epoch=None, now=None):
    """The extra-life request. action: 'ask' (the player who is out asks everyone once), 'restart'
    (that player starts over now), 'accept' / 'decline' (another player answers request_id).
    Every check happens here, on the room the server just read, and the room is written with an
    optimistic lock, so of several near-simultaneous YES taps only the first one that lands counts.
    Returns dict(ok, changed, reason?)."""
    now = time.time() if now is None else now
    sync_bots(g, now)
    swept = sync_help(g, now)
    no = lambda reason: dict(ok=False, changed=swept, reason=reason)  # noqa: E731
    if g['status'] != 'racing' or not g['round'] or round_id != g['round']['id'] or pid not in g['progress']:
        return no('over')
    if action in ('ask', 'restart'):
        life = lives(g, pid)
        out = life.get('out')
        if not out or (epoch is not None and epoch != life['epoch']):
            return no('not_out')
        if action == 'restart':
            _reset(g, pid, now)
            return dict(ok=True, changed=True)
        if out.get('help'):
            return no('already_asked')  # one request per lost life
        if not helpers(g, pid):
            _reset(g, pid, now)
            return dict(ok=False, changed=True, reason='nobody')
        out['help'] = dict(id=uuid.uuid4().hex[:12], expires=now + HELP_SECONDS, declined=[])
        return dict(ok=True, changed=True)
    # accept / decline: find the request
    asker = next((who for who, life in g.get('lives', {}).items()
                  if (life.get('out') or {}).get('help', {}) and life['out']['help']['id'] == request_id), None)
    if asker is None:
        return no('closed')  # already given by someone else, run out, or never existed
    if asker == pid or pid not in helpers(g, asker):
        return no('not_allowed')
    req = lives(g, asker)['out']['help']
    if now >= req['expires']:
        return no('closed')
    if action == 'decline':
        if pid not in req['declined']:
            req['declined'].append(pid)
        sync_help(g, now)  # everyone said no: back to the normal loss now
        return dict(ok=True, changed=True)
    # first valid YES: one heart each, the asker carries on from the next task
    life = lives(g, asker)
    task_index, at = life['out']['task'], life['out']['at']
    life['bonus'] += 1
    life['out'] = None
    done = g['progress'][asker]
    if len(done) == task_index:
        done.append([at, False])  # the missed task counts as answered wrong, like any other miss
    giver = lives(g, pid)
    giver['bonus'] += 1
    names = {p['id']: p['name'] for p in g['players']}
    g['thanks'] = dict(id=uuid.uuid4().hex[:12], by=pid, by_name=names.get(pid, ''), to=asker,
                       to_name=names.get(asker, ''), at=now)
    if len(done) == TASKS:
        _finish(g, asker, now)
    return dict(ok=True, changed=True)


def answer(g, pid, round_id, index, value, now=None, epoch=None):
    """One answer from one player. Right or wrong, it moves the player on; every wrong answer
    costs a heart, and the third one empties the player's clock back to task 1 with full hearts.
    `epoch` counts those resets, so a late retry from before a reset is ignored.
    Returns dict(right, done, word, changed, misses, epoch[, wait, reset])."""
    now = time.time() if now is None else now
    sync_bots(g, now)
    done = g['progress'].get(pid)
    if g['round'] is None or round_id != g['round']['id'] or done is None:
        raise GameError('This round is over. · هالجولة خلصت.')
    sync_help(g, now)
    count = len(done)
    life = lives(g, pid)
    same = dict(misses=life['misses'], epoch=life['epoch'])
    if life.get('out'):
        return dict(right=False, done=count, word=None, changed=False, out=True, **same)  # waiting on a life
    if epoch is not None and epoch != life['epoch']:
        return dict(right=False, done=count, word=None, changed=False, **same)  # from before a reset
    if index < count:
        return dict(right=done[index][1], done=count, word=None, changed=False, **same)  # repeat: already counted
    if g['status'] != 'racing' or index > count:
        return dict(right=False, done=count, word=None, changed=False, **same)
    task = g['round']['tasks'][index]
    ready = reached_at(g, pid, index) + show_time(task) - GRACE
    if now < ready:
        return dict(right=False, done=count, word=None, changed=False, wait=round(ready - now + 0.05, 2), **same)
    right, word = correct(task, value, vote_choices(g, task, pid))
    at = round(max(0.0, now - g['round']['starts_at']), 3)
    if not right and pid not in g.get('bots', {}):
        life['misses'] += 1
        if life['misses'] >= max_hearts(life):
            if helpers(g, pid):
                # out of hearts: before the clock resets, this player may ask the others for a life
                life['out'] = dict(task=index, at=at, decide_by=now + DECIDE_SECONDS, help=None)
                return dict(right=False, done=count, word=word, changed=True, out=True, misses=life['misses'], epoch=life['epoch'])
            _reset(g, pid, now)
            return dict(right=False, done=0, word=word, changed=True, reset=True, misses=0, epoch=life['epoch'])
    done.append([at, bool(right)])
    if len(done) == TASKS:
        _finish(g, pid, now)
    return dict(right=bool(right), done=len(done), word=word, changed=True, misses=life['misses'], epoch=life['epoch'])


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


def _public_out(out):
    """What every phone may know about a player who is out of hearts."""
    if not out:
        return None
    req = out.get('help')
    return dict(decide_by=out['decide_by'], help=dict(id=req['id'], expires=req['expires']) if req else None)


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
                      right=sum(1 for _, ok in g['progress'].get(p['id'], []) if ok),
                      misses=g.get('lives', {}).get(p['id'], {}).get('misses', 0),
                      epoch=g.get('lives', {}).get(p['id'], {}).get('epoch', 0),
                      hearts=LIVES + g.get('lives', {}).get(p['id'], {}).get('bonus', 0),
                      out=_public_out(g.get('lives', {}).get(p['id'], {}).get('out'))) for p in g['players']],
        lives=LIVES, thanks=g.get('thanks'),
        round=dict(id=r['id'], starts_at=r['starts_at'], tasks=r['tasks'],
                   question=vote_text(r['tasks'][VOTE_AT], lang_i) if r['tasks'][VOTE_AT]['type'] == 'vote' else None) if r else None,
        roster=g['roster'],
        # bot finish times (seconds after the start), so every phone can move the bot's clock smoothly
        bots={b: [t for t, _ in plan] for b, plan in g.get('bots', {}).items()} if r else {},
        timing=timing(g) if g['dev'] else None,
    )
