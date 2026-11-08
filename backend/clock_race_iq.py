"""Clock Race · visual reasoning puzzles (اختبار ذكاء بصري), five kinds:

    fold     a paper folded in half and punched: which one is it unfolded?
    hidden   which picture hides this little shape (same size, not turned)?
    matrix   a 3x3 pattern with one missing: which one completes it?
    rotate   which one is the same shape only turned (the others are mirror images)?
    overlap  shapes stacked on each other: which is at the back / on top?

A puzzle is stored as {kind, spec, options, answer}. Nothing is trusted as written: `solve` works out the right
option from the spec on its own, and `validate` refuses a puzzle unless exactly one option is right and that is
the one marked as the answer. The starter bank is made by `generate` with fixed seeds and kept only when it
passes `validate`, so every starter answer is checked by the same code that checks the studio's edits.

`task` turns a stored puzzle into what the phone draws (options shuffled, shapes already turned / mirrored),
so the frontend only draws and never decides anything.
"""
from __future__ import annotations

import copy
import math
import random

KINDS = ('fold', 'hidden', 'matrix', 'rotate', 'overlap')  # the matchstick sums were removed for good
LABELS = {'fold': 'Folded paper', 'hidden': 'Hidden figure', 'matrix': 'Pattern matrix', 'rotate': 'Turned, not mirrored',
          'overlap': 'Overlapping shapes'}
STARTERS = 6   # per kind

SHAPES = ('circle', 'square', 'triangle', 'diamond', 'plus', 'hexagon')  # drawn exactly as _inside() below
# matrix / overlap colours (indices into the frontend's IQ_COLORS): calm, never teal
COLORS = 5


class Bad(ValueError):
    pass


def _pts(v):
    return sorted({(int(a[0]), int(a[1])) for a in v})


# ------------------------------------------------------------------ rotate: turned, not mirrored
# cells: [[x, y, mark]] on a 5x5 grid, mark 1 on one cell (the coloured eye that shows which way it faces).
# An option is [flip, deg] like the jigsaw: flip 'none' | 'H' (left-right) | 'V' (top-bottom), then turned
# clockwise by deg.

def _norm(cells):
    mx = min(c[0] for c in cells)
    my = min(c[1] for c in cells)
    return tuple(sorted((x - mx, y - my, m) for x, y, m in cells))


def _apply(cells, opt):
    flip, deg = opt
    out = []
    for x, y, m in cells:
        if flip == 'H':
            x = -x
        elif flip == 'V':
            y = -y
        for _ in range((int(deg) // 90) % 4):
            x, y = -y, x
        out.append((x, y, m))
    return _norm(out)


def _rotations(cells):
    return {_apply(cells, ('none', d)) for d in (0, 90, 180, 270)}


def _connected(cells):
    pts = {(c[0], c[1]) for c in cells}
    if not pts:
        return False
    seen, stack = set(), [next(iter(pts))]
    while stack:
        p = stack.pop()
        if p in seen:
            continue
        seen.add(p)
        x, y = p
        stack += [n for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)) if n in pts]
    return len(seen) == len(pts)


def solve_rotate(spec, options):
    cells = [tuple(c) for c in spec['cells']]
    rots = _rotations(cells)
    return [i for i, o in enumerate(options) if _apply(cells, o) in rots]


def check_rotate(spec, options):
    cells = [tuple(c) for c in spec.get('cells') or []]
    if not 5 <= len(cells) <= 9 or len({(c[0], c[1]) for c in cells}) != len(cells):
        raise Bad('The shape needs 5 to 9 different blocks')
    if any(not (0 <= c[0] < 5 and 0 <= c[1] < 5) for c in cells):
        raise Bad('Blocks must sit on the 5 x 5 grid')
    if sum(1 for c in cells if c[2]) != 1:
        raise Bad('Exactly one block is the coloured eye')
    if not _connected(cells):
        raise Bad('The blocks must make one piece')
    if _apply(cells, ('H', 0)) in _rotations(cells):
        raise Bad('This shape looks the same in a mirror, so a mirrored answer would be right too')
    if len(options) != 4:
        raise Bad('Needs 4 answers')
    for o in options:
        if o[0] not in ('none', 'H', 'V') or int(o[1]) % 90:
            raise Bad('An answer is [none|H|V, 0|90|180|270]')
    looks = [_apply(cells, o) for o in options]
    if len(set(looks)) != 4:
        raise Bad('Two answers look the same')


def gen_rotate(rng):
    while True:
        cells = {(2, 2)}
        size = rng.choice([6, 7])
        while len(cells) < size:
            x, y = rng.choice(sorted(cells))
            n = rng.choice([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])
            if 0 <= n[0] < 5 and 0 <= n[1] < 5:
                cells.add(n)
        pts = sorted(cells)
        eye = rng.randrange(len(pts))
        spec = dict(cells=[[x, y, 1 if i == eye else 0] for i, (x, y) in enumerate(pts)])
        right = ['none', rng.choice([90, 180, 270])]
        decoys = [[f, rng.choice([0, 90, 180, 270])] for f in rng.choice([['H', 'H', 'V'], ['H', 'V', 'V']])]
        options = [right] + decoys
        rng.shuffle(options)
        try:
            check_rotate(spec, options)
        except Bad:
            continue
        if len(solve_rotate(spec, options)) == 1:
            return spec, options


def view_rotate(spec, options):
    cells = [tuple(c) for c in spec['cells']]
    return dict(shape=[list(c) for c in _norm(cells)], options=[[list(c) for c in _apply(cells, o)] for o in options])


# ------------------------------------------------------------------ fold: punched paper
# A square sheet on a 4x4 grid. axis 'v': the left half folds over onto the right half; 'h': the top half folds
# down onto the bottom half. holes: punched through the folded sheet, in the full grid's coordinates, on the half
# that stays (v: x 2-3, h: y 2-3). Unfolded, every hole has its mirror twin on the other half.

def _unfold(axis, holes):
    out = set()
    for x, y in holes:
        out.add((x, y))
        out.add((3 - x, y) if axis == 'v' else (x, 3 - y))
    return sorted(out)


def solve_fold(spec, options):
    truth = _unfold(spec['axis'], _pts(spec['holes']))
    return [i for i, o in enumerate(options) if _pts(o) == truth]


def check_fold(spec, options):
    axis, holes = spec.get('axis'), _pts(spec.get('holes') or [])
    if axis not in ('v', 'h'):
        raise Bad('Fold must be v (left over right) or h (top over bottom)')
    if not 1 <= len(holes) <= 3:
        raise Bad('Punch 1 to 3 holes')
    for x, y in holes:
        if not (0 <= x < 4 and 0 <= y < 4) or (axis == 'v' and x < 2) or (axis == 'h' and y < 2):
            raise Bad('Holes must be on the folded half')
    if len(options) != 4:
        raise Bad('Needs 4 answers')
    sets = [tuple(_pts(o)) for o in options]
    if any(not s or any(not (0 <= x < 4 and 0 <= y < 4) for x, y in s) for s in sets):
        raise Bad('Every answer needs holes on the 4 x 4 sheet')
    if len(set(sets)) != 4:
        raise Bad('Two answers look the same')


def gen_fold(rng):
    while True:
        axis = rng.choice(['v', 'h'])
        half = [(x, y) for x in range(4) for y in range(4) if (x >= 2 if axis == 'v' else y >= 2)]
        holes = sorted(rng.sample(half, rng.choice([2, 2, 3])))
        truth = _unfold(axis, holes)
        other = 'h' if axis == 'v' else 'v'
        wrong_axis = sorted(set(holes) | {(x, 3 - y) if other == 'h' else (3 - x, y) for x, y in holes})
        # one twin slid by a square (the "almost" answer)
        twins = [p for p in truth if p not in holes]
        moved = None
        for _ in range(20):
            t = rng.choice(twins)
            d = rng.choice([(1, 0), (-1, 0), (0, 1), (0, -1)])
            n = (t[0] + d[0], t[1] + d[1])
            if 0 <= n[0] < 4 and 0 <= n[1] < 4 and n not in truth:
                moved = sorted((set(truth) - {t}) | {n})
                break
        # mirrored the other way round (twins flipped top-bottom inside their half too)
        rotated = sorted({(3 - x, 3 - y) for x, y in holes} | set(holes))
        pool = [o for o in (wrong_axis, moved, rotated) if o and o != truth]
        pool = [list(map(list, o)) for o in dict.fromkeys(tuple(o) for o in pool)]
        if len(pool) < 3:
            continue
        options = [list(map(list, truth))] + pool[:3]
        rng.shuffle(options)
        spec = dict(axis=axis, holes=[list(h) for h in holes])
        try:
            check_fold(spec, options)
        except Bad:
            continue
        if len(solve_fold(spec, options)) == 1:
            return spec, options


def view_fold(spec, options):
    return dict(axis=spec['axis'], holes=_pts(spec['holes']), options=[_pts(o) for o in options])


# ------------------------------------------------------------------ matrix: 3x3 pattern
# cell (row r, column c): shape shapes[(r + c) % 3], colour colors[r], count counts[c]. The bottom-right is missing.

def _cell(spec, r, c):
    return [spec['shapes'][(r + c) % 3], spec['colors'][r], spec['counts'][c]]


def solve_matrix(spec, options):
    truth = _cell(spec, 2, 2)
    return [i for i, o in enumerate(options) if list(o) == truth]


def check_matrix(spec, options):
    s, c, n = spec.get('shapes') or [], spec.get('colors') or [], spec.get('counts') or []
    if len(s) != 3 or len(set(s)) != 3 or any(x not in SHAPES for x in s):
        raise Bad('Needs 3 different shapes')
    if len(c) != 3 or len(set(c)) != 3 or any(not 0 <= int(x) < COLORS for x in c):
        raise Bad('Needs 3 different colours')
    if len(n) != 3 or len(set(n)) != 3 or any(not 1 <= int(x) <= 3 for x in n):
        raise Bad('Counts are 1, 2 and 3 in some order')
    if len(options) != 4:
        raise Bad('Needs 4 answers')
    for o in options:
        if len(o) != 3 or o[0] not in SHAPES or not 0 <= int(o[1]) < COLORS or not 1 <= int(o[2]) <= 3:
            raise Bad('An answer is [shape, colour 0-4, count 1-3]')
    if len({tuple(o) for o in options}) != 4:
        raise Bad('Two answers look the same')


def gen_matrix(rng):
    while True:
        spec = dict(shapes=rng.sample(SHAPES, 3), colors=rng.sample(range(COLORS), 3), counts=rng.sample([1, 2, 3], 3))
        truth = _cell(spec, 2, 2)
        # each decoy breaks exactly one rule, using a shape / colour / count that is already on the board
        decoys = [[x, truth[1], truth[2]] for x in spec['shapes'] if x != truth[0]]
        decoys += [[truth[0], x, truth[2]] for x in spec['colors'] if x != truth[1]]
        decoys += [[truth[0], truth[1], x] for x in spec['counts'] if x != truth[2]]
        picks = [rng.choice(decoys[0:2]), rng.choice(decoys[2:4]), rng.choice(decoys[4:6])]
        options = [truth] + picks
        rng.shuffle(options)
        try:
            check_matrix(spec, options)
        except Bad:
            continue
        if len(solve_matrix(spec, options)) == 1:
            return spec, options


def view_matrix(spec, options):
    grid = [[_cell(spec, r, c) for c in range(3)] for r in range(3)]
    grid[2][2] = None
    return dict(grid=grid, options=[list(o) for o in options])


# ------------------------------------------------------------------ hidden: find the little shape
# Lines on a 4x4 lattice (points 0-4). An edge is ['h', x, y] (from (x,y) to (x+1,y)) or ['v', x, y] (to (x,y+1)).
# The target is found in a picture when all its edges are there after sliding it (no turning, no mirroring).

def _edges(v):
    out = set()
    for e in v:
        o, x, y = e[0], int(e[1]), int(e[2])
        if o not in ('h', 'v') or not (0 <= x <= 4 and 0 <= y <= 4) or (o == 'h' and x > 3) or (o == 'v' and y > 3):
            raise Bad('An edge is [h|v, x, y] on the 4 x 4 lattice')
        out.add((o, x, y))
    return out


def _contains(pic, target):
    xs = [x for _, x, _ in target]
    ys = [y for _, _, y in target]
    for dx in range(-min(xs), 5 - min(xs)):
        for dy in range(-min(ys), 5 - min(ys)):
            if all((o, x + dx, y + dy) in pic for o, x, y in target):
                return True
    return False


def solve_hidden(spec, options):
    target = _edges(spec['target'])
    return [i for i, o in enumerate(options) if _contains(_edges(o), target)]


def check_hidden(spec, options):
    target = _edges(spec.get('target') or [])
    if not 3 <= len(target) <= 6:
        raise Bad('The shape needs 3 to 6 lines')
    if len(options) != 4:
        raise Bad('Needs 4 answers')
    pics = [frozenset(_edges(o)) for o in options]
    if len(set(pics)) != 4:
        raise Bad('Two answers look the same')
    if any(len(p) < len(target) + 3 for p in pics):
        raise Bad('Every picture needs more lines than the shape, or nothing is hidden')


ALL_EDGES = [('h', x, y) for x in range(4) for y in range(5)] + [('v', x, y) for x in range(5) for y in range(4)]


def _walk(rng, n):
    """A connected run of n lattice edges (a little squiggle with corners)."""
    while True:
        x, y = rng.randrange(1, 4), rng.randrange(1, 4)
        edges = []
        for _ in range(n * 4):
            d = rng.choice([(1, 0), (-1, 0), (0, 1), (0, -1)])
            nx, ny = x + d[0], y + d[1]
            if not (0 <= nx <= 3 and 0 <= ny <= 3):
                continue
            e = ('h', min(x, nx), y) if d[1] == 0 else ('v', x, min(y, ny))
            if e not in edges:
                edges.append(e)
            x, y = nx, ny
            if len(edges) == n:
                break
        if len(edges) == n and len({o for o, _, _ in edges}) == 2:
            mx = min(e[1] for e in edges)
            my = min(e[2] for e in edges)
            return {(o, a - mx, b - my) for o, a, b in edges}


def gen_hidden(rng):
    while True:
        target = _walk(rng, rng.choice([4, 4, 5]))
        w = max(x + (o == 'h') for o, x, _ in target)
        h = max(y + (o == 'v') for o, _, y in target)
        dx, dy = rng.randrange(0, 5 - w), rng.randrange(0, 5 - h)
        placed = {(o, x + dx, y + dy) for o, x, y in target}
        extra = 6
        right = set(placed) | set(rng.sample([e for e in ALL_EDGES if e not in placed], extra))
        decoys = []
        for _ in range(200):
            # a near miss: the shape with one line moved, plus as many other lines
            near = set(placed)
            near.discard(rng.choice(sorted(near)))
            near.add(rng.choice([e for e in ALL_EDGES if e not in placed]))
            pic = near | set(rng.sample([e for e in ALL_EDGES if e not in near], extra))
            if not _contains(pic, target) and frozenset(pic) not in {frozenset(d) for d in decoys} and pic != right:
                decoys.append(pic)
            if len(decoys) == 3:
                break
        if len(decoys) < 3:
            continue
        options = [sorted(map(list, p)) for p in [right] + decoys]
        rng.shuffle(options)
        spec = dict(target=sorted(map(list, target)))
        try:
            check_hidden(spec, options)
        except Bad:
            continue
        if len(solve_hidden(spec, options)) == 1:
            return spec, options


def view_hidden(spec, options):
    return dict(target=sorted(map(list, _edges(spec['target']))), options=[sorted(map(list, _edges(o))) for o in options])


# ------------------------------------------------------------------ overlap: what's at the back / on top
# layers, back to front: {shape, color, x, y, s} on a 100 x 100 board (centre x, y and size s). The options name
# layers by index. Checked on a raster: every layer shows, and every layer visibly covers the one under it, so
# the whole stacking order can be read from the picture.

def _inside(shape, cx, cy, s, px, py):
    dx, dy = (px - cx) / (s / 2), (py - cy) / (s / 2)
    if shape == 'circle':
        return dx * dx + dy * dy <= 1
    if shape == 'square':
        return abs(dx) <= .86 and abs(dy) <= .86
    if shape == 'diamond':
        return abs(dx) + abs(dy) <= 1
    if shape == 'triangle':  # pointing up, base at dy = .8
        return -1 <= dy <= .8 and abs(dx) <= (dy + 1) / 1.8
    if shape == 'hexagon':
        return abs(dy) <= .87 and abs(dx) + abs(dy) * .577 <= 1
    if shape == 'plus':  # two crossing bars
        return (abs(dx) <= .34 and abs(dy) <= 1) or (abs(dy) <= .34 and abs(dx) <= 1)
    return False


def _raster(layers, n=50):
    top = {}
    cover = {}
    for i, L in enumerate(layers):
        for gx in range(n):
            for gy in range(n):
                px, py = (gx + .5) * 100 / n, (gy + .5) * 100 / n
                if _inside(L['shape'], L['x'], L['y'], L['s'], px, py):
                    cover.setdefault((gx, gy), []).append(i)
                    top[(gx, gy)] = i
    return top, cover


def solve_overlap(spec, options):
    want = 0 if spec['ask'] == 'back' else len(spec['layers']) - 1
    return [i for i, o in enumerate(options) if int(o) == want]


def check_overlap(spec, options):
    layers = spec.get('layers') or []
    if spec.get('ask') not in ('back', 'front'):
        raise Bad('Ask is back or front')
    if not 3 <= len(layers) <= 4:
        raise Bad('Needs 3 or 4 shapes')
    for L in layers:
        if L.get('shape') not in SHAPES or not 0 <= int(L.get('color', -1)) < COLORS:
            raise Bad('Every shape needs a shape name and a colour 0-4')
        if not (20 <= L.get('s', 0) <= 80 and 10 <= L.get('x', 0) <= 90 and 10 <= L.get('y', 0) <= 90):
            raise Bad('Shapes must sit on the board (size 20-80)')
    if len({(L['shape'], int(L['color'])) for L in layers}) != len(layers) or len({int(L['color']) for L in layers}) != len(layers):
        raise Bad('Every shape needs its own colour')
    top, cover = _raster(layers)
    for i in range(len(layers)):
        if sum(1 for v in top.values() if v == i) < 40:
            raise Bad(f'Shape {i + 1} is hidden too much')
    for i in range(len(layers) - 1):
        # where i+1 lies over i, with nothing above it: that's what shows i+1 is in front of i
        if sum(1 for p, who in cover.items() if i in who and top[p] == i + 1) < 12:
            raise Bad(f'Shapes {i + 1} and {i + 2} do not overlap clearly')
    if len(options) != len(layers) or sorted(int(o) for o in options) != list(range(len(layers))):
        raise Bad('The answers are each shape once')


def gen_overlap(rng):
    while True:
        n = rng.choice([3, 4])
        shapes = rng.sample(SHAPES, n)
        colors = rng.sample(range(COLORS), n)
        layers = []
        for i in range(n):
            a = rng.uniform(0, 6.283)
            r = rng.uniform(10, 18)
            layers.append(dict(shape=shapes[i], color=colors[i], s=rng.randint(46, 60),
                               x=round(50 + r * math.cos(a)), y=round(50 + r * math.sin(a))))
        spec = dict(ask=rng.choice(['back', 'back', 'front']), layers=layers)
        options = list(range(n))
        rng.shuffle(options)
        try:
            check_overlap(spec, options)
        except Bad:
            continue
        if len(solve_overlap(spec, options)) == 1:
            return spec, options


def view_overlap(spec, options):
    return dict(ask=spec['ask'], layers=copy.deepcopy(spec['layers']),
                options=[dict(spec['layers'][int(o)], i=int(o)) for o in options])


# ------------------------------------------------------------------ one interface for all five

GEN = {'fold': gen_fold, 'hidden': gen_hidden, 'matrix': gen_matrix, 'rotate': gen_rotate, 'overlap': gen_overlap}
SOLVE = {'fold': solve_fold, 'hidden': solve_hidden, 'matrix': solve_matrix, 'rotate': solve_rotate,
         'overlap': solve_overlap}
CHECK = {'fold': check_fold, 'hidden': check_hidden, 'matrix': check_matrix, 'rotate': check_rotate,
         'overlap': check_overlap}
VIEW = {'fold': view_fold, 'hidden': view_hidden, 'matrix': view_matrix, 'rotate': view_rotate,
        'overlap': view_overlap}


def generate(kind, rng=None):
    """A new puzzle of a kind, already checked: {kind, spec, options, answer}."""
    rng = rng or random.SystemRandom()
    spec, options = GEN[kind](rng)
    right = SOLVE[kind](spec, options)
    assert len(right) == 1
    return dict(kind=kind, spec=spec, options=options, answer=right[0])


def problems(d):
    """[(level, message)] for a stored puzzle. Errors block approval."""
    kind = d.get('kind')
    if kind == 'match':
        return [('error', 'Matchstick sums are no longer used in the game')]
    if kind not in KINDS:
        return [('error', 'Unknown puzzle kind')]
    try:
        CHECK[kind](d.get('spec') or {}, d.get('options') or [])
        right = SOLVE[kind](d['spec'], d['options'])
    except Bad as exc:
        return [('error', str(exc))]
    except (KeyError, TypeError, ValueError, IndexError) as exc:
        return [('error', f'The puzzle data is incomplete ({type(exc).__name__})')]
    if len(right) != 1:
        return [('error', f'{len(right)} answers are right (needs exactly 1)')]
    if d.get('answer') != right[0]:
        return [('error', f'The marked answer is option {(d.get("answer") or 0) + 1}, but option {right[0] + 1} is the right one')]
    out = []
    if kind == 'rotate' and d['options'][right[0]][1] % 360 == 0:
        out.append(('warn', 'The right answer is not turned at all, so it is easy to spot'))
    return out


def task(qid, d, rng=None):
    """What the phone draws: options shuffled, with the right one tracked."""
    rng = rng or random.SystemRandom()
    order = list(range(len(d['options'])))
    rng.shuffle(order)
    options = [d['options'][i] for i in order]
    shown = VIEW[d['kind']](d['spec'], options)
    return dict(type='iq', qid=qid, kind=d['kind'], view=shown, answer=order.index(d['answer']))


_BUILTIN = None


def builtin():
    """{id: data}: STARTERS puzzles of each kind from fixed seeds (the same every time the server starts)."""
    global _BUILTIN
    if _BUILTIN is None:
        out = {}
        for kind in KINDS:
            for i in range(STARTERS):
                d = generate(kind, random.Random(f'clock-race-iq:{kind}:{i}'))
                assert not [p for p in problems(d) if p[0] == 'error'], (kind, i, problems(d))
                out[f'iq_{kind}_{i + 1:02d}'] = d
        _BUILTIN = out
    return _BUILTIN
