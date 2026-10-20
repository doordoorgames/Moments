"""Emoji Rooftop engine: one shared riddle screen, answers shouted out loud.

There is no typing and no scoring. The host creates a room in English or Arabic,
can start alone, and drives every round by hand: the emojis spin in, everyone
shouts, the host taps Reveal answer, then Next round. Anyone who joins with the
code gets a mirror of the host's screen, in the host's language.
"""
import csv
import io
import re
import secrets
import unicodedata
import uuid

from emoji_arabic import SEED_CSV_AR
from emoji_english import SEED_CSV_EN

SPIN = 1.2
INTRO = 2.0
MAX_SEATS = 40
MAX_ROUNDS = 50
ITEMS = 7  # random table items, drawn by the frontend
LANGS = ('en', 'ar')
VERSION = 2  # rooms from the old typing version are not playable


class GameError(ValueError):
    """Carries the English and Arabic message; the room's language picks one."""
    def __init__(self, en, ar=None):
        super().__init__(en)
        self.ar = ar or en

    def text(self, lang):
        return self.ar if lang == 'ar' else str(self)


# ------------------------------------------------------------------ clue banks

def parse_csv(text):
    """Parse category,emojis,answer[,aliases] rows. Returns (clues, errors)."""
    clues, errors = [], []
    reader = csv.reader(io.StringIO((text or '').strip()))
    for line, row in enumerate(reader, 1):
        if not row or not any(c.strip() for c in row):
            continue
        if line == 1 and [c.strip().lower() for c in row[:3]] == ['category', 'emojis', 'answer']:
            continue
        if len(row) < 3 or not row[0].strip() or not row[1].strip() or not row[2].strip():
            errors.append(f'Line {line}: needs category, emojis and answer.')
            continue
        aliases = [a.strip() for a in (row[3] if len(row) > 3 else '').split('|') if a.strip()]
        clues.append(dict(category=row[0].strip()[:24], emojis=row[1].strip()[:64],
                          answer=row[2].strip()[:80], aliases=aliases[:8]))
    return clues, errors


SEEDS = {'en': parse_csv(SEED_CSV_EN)[0], 'ar': parse_csv(SEED_CSV_AR)[0]}
SEED = SEEDS['en']


def to_csv(clues):
    out = io.StringIO()
    w = csv.writer(out, lineterminator='\n')
    w.writerow(['category', 'emojis', 'answer', 'aliases'])
    for c in clues:
        w.writerow([c['category'], c['emojis'], c['answer'], '|'.join(c.get('aliases') or [])])
    return out.getvalue()


def normalize(text):
    """Loose key for spotting duplicate answers when adding to a bank."""
    text = unicodedata.normalize('NFKD', text or '')
    text = ''.join(ch for ch in text if not unicodedata.combining(ch)).casefold()
    text = text.translate(str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ة': 'ه', 'ى': 'ي'}))
    text = re.sub(r'[^\w\s]', ' ', text.replace('&', ' and '))
    text = ' '.join(text.split())
    if text.startswith('the '):
        text = text[4:]
    return text.replace(' ', '')


# ------------------------------------------------------------------ seats

def lang_of(g):
    return g.get('lang', 'en')


def add_seat(g):
    """A seat is just a phone watching the room: no name, no score."""
    if len(g['seats']) >= MAX_SEATS:
        raise GameError(f'This rooftop is full ({MAX_SEATS} phones).', f'السطح فل ({MAX_SEATS} تلفون).')
    seat = dict(id=str(uuid.uuid4()), token=secrets.token_urlsafe(32))
    g['seats'].append(seat)
    g['version'] += 1
    return seat


def authenticate(g, sid, token):
    for s in g.get('seats', []):
        if s['id'] == sid and secrets.compare_digest(s['token'], token or ''):
            return s
    raise GameError('Your session could not be verified. Use the device where you joined.',
                    'ما قدرنا نتأكد منك. استخدم نفس الجهاز اللي دخلت منه.')


def check_rounds(rounds):
    if not 1 <= int(rounds) <= MAX_ROUNDS:
        raise GameError(f'Choose between 1 and {MAX_ROUNDS} rounds.', f'اختار من 1 إلى {MAX_ROUNDS} جولة.')
    return int(rounds)


def new_game(rounds=10, lang='en'):
    if lang not in LANGS:
        raise GameError('Choose English or Arabic.', 'اختار إنجليزي أو عربي.')
    g = dict(v=VERSION, lang=lang, status='lobby', rounds=check_rounds(rounds), seats=[], clues=[], items=[],
             round=0, revealed=False, round_at=None, run=str(uuid.uuid4()), version=0)
    host = add_seat(g)
    g['host'] = host['id']
    return g, host


# ------------------------------------------------------------------ host controls

def start(g, bank, now, rounds=None):
    """The host may start alone; people who join later land in the current round."""
    bank = [c for c in bank if c.get('emojis') and c.get('answer')]
    if not bank:
        raise GameError('The clue bank is empty.', 'قائمة الألغاز فاضية.')
    if rounds is not None:
        g['rounds'] = check_rounds(rounds)
    count = min(g['rounds'], len(bank))
    picks = secrets.SystemRandom().sample(range(len(bank)), count)
    g.update(status='active', clues=[dict(bank[i]) for i in picks],
             items=[secrets.randbelow(ITEMS) for _ in range(count)],
             round=0, revealed=False, round_at=now + INTRO, run=str(uuid.uuid4()))
    g['version'] += 1


def reveal(g, now):
    if g['status'] != 'active':
        raise GameError('No round is running.', 'ما في جولة شغالة.')
    if now < g['round_at']:
        raise GameError('The emojis are still coming in.', 'الإيموجي بعدها ما وصلت.')
    if g['revealed']:
        return
    g['revealed'] = True
    g['version'] += 1


def next_round(g, now):
    if g['status'] != 'active':
        raise GameError('No round is running.', 'ما في جولة شغالة.')
    if not g['revealed']:
        raise GameError('Reveal the answer first.', 'اكشف الجواب أول.')
    if g['round'] + 1 >= len(g['clues']):
        g['status'] = 'ended'
    else:
        g.update(round=g['round'] + 1, revealed=False, round_at=now)
    g['version'] += 1


# ------------------------------------------------------------------ what every phone sees

def phase(g, now):
    """lobby, intro (countdown before round 1), showing, reveal or ended."""
    if g['status'] in ('lobby', 'ended'):
        return g['status']
    if now < g['round_at']:
        return 'intro'
    return 'reveal' if g['revealed'] else 'showing'


def view(g, sid, now):
    p = phase(g, now)
    v = dict(status=g['status'], phase=p, lang=lang_of(g), host=g['host'], me=sid, rounds=g['rounds'],
             run=g['run'], version=g['version'], now=now, total=len(g['clues']), viewers=len(g['seats']))
    if p in ('lobby', 'ended'):
        return v
    i = g['round']
    clue = g['clues'][i]
    v.update(round=i, round_at=g['round_at'], spin=SPIN, item=g['items'][i])
    if p != 'intro':
        v.update(clue=dict(category=clue['category'], emojis=clue['emojis']),
                 answer=clue['answer'] if p == 'reveal' else None)
    return v
