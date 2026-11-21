"""TikTok Memory engine: words flash for 2 seconds each, you draw them, then you
call them out in order from your own drawings while the room watches.

One player at a time. The host picks the length (9, 12, 15 or 20 words) and the
language. Each turn:

  ready    whose turn it is; the drawer taps Ready
  drawing  3-second countdown, then one word every STEP seconds; the drawer's
           phone sends each drawing as its time runs out
  recall   everyone sees the drawer's grid; the drawer says the words out loud
           and the judge marks each one right or wrong
  result   the locked score out of the total

The host judges everyone else; on the host's own turn the next player gets the
answer key. Playing alone, the host marks his own run. After every player has
had a turn the game ends; a tie for first can be settled with a tiebreaker
where only the tied players play again.
"""
import secrets
import uuid

from tiktok_memory_words import WORDS

VERSION = 1
LANGS = ('en', 'ar')
LENGTHS = {9: (3, 3), 12: (3, 4), 15: (3, 5), 20: (4, 5)}  # words: (columns, rows)
DEFAULT_LENGTH = 12
STEP = 2.0          # seconds per word
COUNTDOWN = 3.0     # 3-2-1 before the first word
GRACE = 8.0         # after the last word, how long the drawer's phone has to send drawings
MAX_PLAYERS = 12
NAME_MAX = 16
W, H = 300, 400     # drawing space (3:4, the shape of every grid cell)
MAX_STROKES = 80
MAX_POINTS = 2400   # numbers per drawing (x, y pairs)


class GameError(ValueError):
    """Carries the English and Arabic message; the room's language picks one."""
    def __init__(self, en, ar=None):
        super().__init__(en)
        self.ar = ar or en

    def text(self, lang):
        return self.ar if lang == 'ar' else str(self)


def lang_of(g):
    return g.get('lang', 'en')


# ------------------------------------------------------------------ players

def clean_name(value):
    name = ' '.join(str(value or '').split())[:NAME_MAX]
    if not name:
        raise GameError(f'Type a name (up to {NAME_MAX} letters).', f'اكتب اسمك (لين {NAME_MAX} حرف).')
    return name


def add_player(g, name):
    name = clean_name(name)
    if len(g['players']) >= MAX_PLAYERS:
        raise GameError(f'This rooftop is full ({MAX_PLAYERS} players).', f'السطح فل ({MAX_PLAYERS} لاعب).')
    if any(p['name'].casefold() == name.casefold() for p in g['players']):
        raise GameError('That name is taken in this room.', 'هالاسم مأخوذ في هالغرفة.')
    p = dict(id=str(uuid.uuid4()), name=name, token=secrets.token_urlsafe(32))
    g['players'].append(p)
    # Someone who arrives mid-game still gets a turn at the end (not during a tiebreaker).
    if g['status'] == 'playing' and not g['tiebreak']:
        g['order'].append(p['id'])
    g['version'] += 1
    return p


def authenticate(g, pid, token):
    for p in g.get('players', []):
        if p['id'] == pid and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError('Your session could not be verified. Use the device where you joined.',
                    'ما قدرنا نتأكد منك. استخدم نفس الجهاز اللي دخلت منه.')


def check_length(length):
    try:
        length = int(length)
    except (TypeError, ValueError):
        length = 0
    if length not in LENGTHS:
        raise GameError('Pick 9, 12, 15 or 20 words.', 'اختار 9 أو 12 أو 15 أو 20 كلمة.')
    return length


def new_game(name, lang='en', length=DEFAULT_LENGTH):
    if lang not in LANGS:
        raise GameError('Choose English or Arabic.', 'اختار إنجليزي أو عربي.')
    g = dict(v=VERSION, lang=lang, status='lobby', length=check_length(length), players=[], host=None,
             order=[], turn=0, phase=None, words=[], drawings=[], marks=[], draw_at=None,
             scores={}, tb={}, tiebreak=False, tb_round=0, used=[], run=str(uuid.uuid4()), version=0)
    host = add_player(g, name)
    g['host'] = host['id']
    return g, host


# ------------------------------------------------------------------ turns

def drawer(g):
    if g['status'] != 'playing' or g['turn'] >= len(g['order']):
        return None
    return g['order'][g['turn']]


def judge(g):
    """The host judges; on the host's own turn the next player takes the answer key."""
    d = drawer(g)
    if d is None:
        return None
    if d != g['host']:
        return g['host']
    ids = [p['id'] for p in g['players']]
    after = ids[ids.index(d) + 1:] + ids[:ids.index(d)] if d in ids else ids
    return next((pid for pid in after if pid != d), d)  # alone: the host marks his own run


def _begin(g, order, now):
    g.update(status='playing', order=list(order), turn=0, phase='ready', words=[], drawings=[], marks=[],
             draw_at=None, run=str(uuid.uuid4()))
    g['version'] += 1


def start(g, now, length=None):
    if g['status'] != 'lobby':
        raise GameError('The game has already started.', 'اللعبة بدت خلاص.')
    if length is not None:
        g['length'] = check_length(length)
    g.update(scores={}, tb={}, tiebreak=False, tb_round=0)
    _begin(g, [p['id'] for p in g['players']], now)


def replay(g, now, length=None):
    if g['status'] != 'ended':
        raise GameError('Finish this game first.', 'خلصوا اللعبة أول.')
    if length is not None:
        g['length'] = check_length(length)
    g.update(scores={}, tb={}, tiebreak=False, tb_round=0)
    _begin(g, [p['id'] for p in g['players']], now)


def _fresh_words(g, n):
    """Fresh words for every turn: nobody draws a word the room has already watched."""
    col = 1 if lang_of(g) == 'ar' else 0
    used = set(g.get('used', []))
    free = [i for i in range(len(WORDS)) if i not in used]
    if len(free) < n:
        used, free = set(), list(range(len(WORDS)))
    picks = secrets.SystemRandom().sample(free, n)
    g['used'] = sorted(used | set(picks))
    return [WORDS[i][col] for i in picks]


def ready(g, pid, now):
    """The drawer is holding the phone: pick the words and start the countdown."""
    if g['status'] != 'playing' or g['phase'] != 'ready':
        raise GameError('It is not time to draw.', 'مو وقت الرسم.')
    if pid != drawer(g):
        raise GameError('Only the player whose turn it is can start.', 'بس صاحب الدور يقدر يبدأ.')
    n = g['length']
    g.update(phase='drawing', words=_fresh_words(g, n), drawings=[None] * n, marks=[None] * n,
             draw_at=now + COUNTDOWN)
    g['version'] += 1


def draw_end(g):
    return g['draw_at'] + g['length'] * STEP


def settle(g, now):
    """Drawing closes on its own once the last word is over and the grace time has passed."""
    if g['status'] == 'playing' and g['phase'] == 'drawing' and now >= draw_end(g) + GRACE:
        g['phase'] = 'recall'
        g['drawings'] = [d if d is not None else [] for d in g['drawings']]
        g['version'] += 1
        return True
    return False


def clean_strokes(raw):
    """Strokes are flat [x0, y0, x1, y1, ...] lists in a 300x400 space."""
    if not isinstance(raw, list):
        raise GameError('That drawing could not be read.', 'ما قدرنا نقرا الرسمة.')
    strokes, total = [], 0
    for s in raw[:MAX_STROKES]:
        if not isinstance(s, list):
            continue
        pts = []
        for i in range(0, len(s) - 1, 2):
            x, y = s[i], s[i + 1]
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)) or isinstance(x, bool) or isinstance(y, bool):
                continue
            pts += [max(0, min(W, int(round(x)))), max(0, min(H, int(round(y))))]
        room = MAX_POINTS - total
        if room < 2:
            break
        pts = pts[:room - room % 2]
        if pts:
            strokes.append(pts)
            total += len(pts)
    return strokes


def submit(g, pid, drawings, now):
    """The drawer's phone sends one or more finished drawings, keyed by word index."""
    if g['status'] != 'playing' or g['phase'] != 'drawing':
        return False
    if pid != drawer(g):
        raise GameError('Only the drawer can send drawings.', 'بس الرسام يقدر يرسل رسمات.')
    if not isinstance(drawings, dict):
        raise GameError('That drawing could not be read.', 'ما قدرنا نقرا الرسمة.')
    changed = False
    for key, raw in drawings.items():
        try:
            i = int(key)
        except (TypeError, ValueError):
            continue
        if not 0 <= i < g['length']:
            continue
        # A word's drawing is only accepted once its two seconds have started.
        if now < g['draw_at'] + i * STEP - 1:
            continue
        g['drawings'][i] = clean_strokes(raw)
        changed = True
    if now >= draw_end(g) - 0.5 and all(d is not None for d in g['drawings']):
        g['phase'] = 'recall'
        changed = True
    if changed:
        g['version'] += 1
    return changed


def finish_drawing(g, pid, now):
    """Drawer or host closes the drawing early once the last word is over (lost uploads)."""
    if g['status'] != 'playing' or g['phase'] != 'drawing':
        raise GameError('Nobody is drawing right now.', 'محد يرسم الحين.')
    if pid not in (drawer(g), g['host']):
        raise GameError('Only the drawer or the host can do that.', 'بس الرسام أو المضيف يقدر.')
    if now < draw_end(g):
        raise GameError('The words are still coming.', 'الكلمات بعدها شغالة.')
    g['phase'] = 'recall'
    g['drawings'] = [d if d is not None else [] for d in g['drawings']]
    g['version'] += 1


def mark(g, pid, index, value):
    if g['status'] != 'playing' or g['phase'] != 'recall':
        raise GameError('Nothing to judge right now.', 'ما في شي ينحكم عليه الحين.')
    if pid != judge(g):
        raise GameError('Only the judge can mark answers.', 'بس الحكم يقدر يصحح.')
    if not isinstance(index, int) or not 0 <= index < g['length']:
        raise GameError('That word does not exist.', 'هالكلمة مو موجودة.')
    if value not in (True, False, None):
        raise GameError('Mark it right or wrong.', 'صح أو غلط.')
    g['marks'][index] = value
    g['version'] += 1


def lock(g, pid):
    if g['status'] != 'playing' or g['phase'] != 'recall':
        raise GameError('Nothing to lock right now.', 'ما في شي ينقفل الحين.')
    if pid != judge(g):
        raise GameError('Only the judge can lock the score.', 'بس الحكم يقدر يقفل النتيجة.')
    if any(m is None for m in g['marks']):
        raise GameError('Mark every word first.', 'صحح كل الكلمات أول.')
    score = sum(1 for m in g['marks'] if m)
    (g['tb'] if g['tiebreak'] else g['scores'])[drawer(g)] = score
    g['phase'] = 'result'
    g['version'] += 1


def next_turn(g, pid, now):
    """Host moves on after a result, or skips someone who is not here (ready phase)."""
    if pid != g['host']:
        raise GameError('Only the host can do that.', 'بس المضيف يقدر يسوي هالشي.')
    if g['status'] != 'playing' or g['phase'] not in ('result', 'ready'):
        raise GameError('Finish this turn first.', 'خلصوا هالدور أول.')
    g['turn'] += 1
    if g['turn'] >= len(g['order']):
        g.update(status='ended', phase=None, tiebreak=False)
    else:
        g.update(phase='ready', words=[], drawings=[], marks=[], draw_at=None)
    g['version'] += 1


# ------------------------------------------------------------------ the end

def standings(g):
    """Ranked players. A tie for first is settled by the latest tiebreaker; ties below first don't matter."""
    names = {p['id']: p['name'] for p in g['players']}
    played = [pid for pid in names if pid in g['scores']]
    if not played:
        return [], [], None
    top = max(g['scores'][pid] for pid in played)
    leaders = [pid for pid in played if g['scores'][pid] == top]
    tb = g.get('tb') or {}
    winner, tied = None, []
    if len(leaders) == 1:
        winner = leaders[0]
    else:
        settled = [pid for pid in leaders if pid in tb]
        if len(settled) == len(leaders):
            best = max(tb[pid] for pid in leaders)
            tops = [pid for pid in leaders if tb[pid] == best]
            if len(tops) == 1:
                winner = tops[0]
            else:
                tied = tops
        else:
            tied = leaders

    def key(pid):
        return (0 if pid == winner else 1, -g['scores'][pid], -(tb.get(pid, -1) if pid in leaders else -1), names[pid].casefold())

    rows = [dict(id=pid, name=names[pid], score=g['scores'][pid], tb=tb.get(pid) if pid in leaders else None)
            for pid in sorted(played, key=key)]
    return rows, tied, winner


def tiebreak(g, pid, now):
    if pid != g['host']:
        raise GameError('Only the host can do that.', 'بس المضيف يقدر يسوي هالشي.')
    if g['status'] != 'ended':
        raise GameError('Finish this game first.', 'خلصوا اللعبة أول.')
    _, tied, _ = standings(g)
    if len(tied) < 2:
        raise GameError('There is no tie for first.', 'ما في تعادل على المركز الأول.')
    g['tb'] = {k: v for k, v in (g.get('tb') or {}).items() if k not in tied}
    g['tiebreak'] = True
    g['tb_round'] += 1
    _begin(g, tied, now)
    g['tiebreak'] = True


# ------------------------------------------------------------------ what every phone sees

def view(g, pid, now):
    settle(g, now)
    cols, rows = LENGTHS[g['length']]
    d, j = drawer(g), judge(g)
    v = dict(status=g['status'], phase=g['phase'], lang=lang_of(g), host=g['host'], me=pid, run=g['run'],
             version=g['version'], now=now, length=g['length'], cols=cols, rows=rows, step=STEP,
             countdown=COUNTDOWN, grace=GRACE,
             players=[dict(id=p['id'], name=p['name']) for p in g['players']],
             order=list(g['order']), turn=g['turn'], drawer=d, judge=j, self_judge=bool(d) and d == j,
             scores=dict(g['scores']), tb=dict(g.get('tb') or {}), tiebreak=g['tiebreak'], tb_round=g['tb_round'])
    if g['status'] == 'ended':
        rows_, tied, winner = standings(g)
        v.update(standings=rows_, tied=tied, winner=winner)
        return v
    if g['status'] != 'playing' or g['phase'] == 'ready':
        return v
    v.update(draw_at=g['draw_at'], drawings=g['drawings'], marks=g['marks'])
    words = g['words']
    if g['phase'] == 'drawing' or g['phase'] == 'result' or pid == j:
        v['words'] = list(words)
    else:
        # During recall a word shows up for the room only once the judge has marked it.
        v['words'] = [w if m is not None else None for w, m in zip(words, g['marks'])]
    return v
