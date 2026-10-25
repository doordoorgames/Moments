"""Letter TV: two retro televisions, one random letter each. The game never judges answers.

The room holds the current pair and the TV arrangement (which of the six TV pictures sits
where), picked once at creation so every phone in the room draws the same row of TVs. The host's phone is the remote; every other phone
just watches. A press must name the pair it is replacing (seq), so a double tap or a
stale screen can never skip a pair.
"""
import random
import secrets
import uuid

VERSION = 1
# Letter sets by language. Arabic can be added here later; only English ships for now.
ALPHABETS = {'en': [chr(c) for c in range(ord('A'), ord('Z') + 1)]}
# Per-position pools. English: X and Z never appear; Q may start a pair but never end one.
# Must match START_LETTERS / END_LETTERS in frontend/src/components/letterTv/letters.js.
START_LETTERS = {'en': [c for c in ALPHABETS['en'] if c not in 'XZ']}
END_LETTERS = {'en': [c for c in ALPHABETS['en'] if c not in 'XZQ']}
LANGS = tuple(ALPHABETS)
MAX_SEATS = 24
# Must match TV_IDS in frontend/src/components/letterTv/screens.js.
# Arrangement order: [far-left, near-left, centre-left, centre-right, near-right, far-right].
TV_IDS = ('purple', 'beige', 'blue', 'yellow', 'orange', 'teal')
# The art faces a direction: right-facing TVs always fill the left half, left-facing the right half.
LEFT_TVS = ('purple', 'blue', 'orange')
RIGHT_TVS = ('teal', 'yellow', 'beige')
_last_tvs = None


class GameError(ValueError):
    pass


def new_pair(lang='en', previous=None, rng=secrets.choice):
    first, last = START_LETTERS.get(lang, ALPHABETS[lang]), END_LETTERS.get(lang, ALPHABETS[lang])
    while True:
        pair = [rng(first), rng(last)]
        if pair != previous:
            return pair


def valid_tvs(tvs):
    return (isinstance(tvs, list) and sorted(tvs) == sorted(TV_IDS)
            and set(tvs[:3]) == set(LEFT_TVS) and set(tvs[3:]) == set(RIGHT_TVS))


def _shuffled(rng):
    left, right = list(LEFT_TVS), list(RIGHT_TVS)
    rng.shuffle(left)
    rng.shuffle(right)
    return left + right


def new_arrangement(avoid=None, rng=secrets.SystemRandom()):
    """A fresh random order of the six TVs, never the same as `avoid` or the last room's."""
    global _last_tvs
    blocked = [a for a in (avoid, _last_tvs) if valid_tvs(a)]
    for _ in range(20):
        tvs = _shuffled(rng)
        if tvs not in blocked:
            break
    _last_tvs = tvs
    return tvs


def arrangement(g):
    """The room's locked arrangement. Rooms created before arrangements existed get a stable one."""
    if valid_tvs(g.get('tvs')):
        return g['tvs']
    return _shuffled(random.Random(g['host']['id']))


def new_room(lang='en', avoid=None):
    if lang not in LANGS:
        raise GameError('Only English letters are available right now.')
    host = dict(id=str(uuid.uuid4()), token=secrets.token_urlsafe(32))
    return dict(v=VERSION, lang=lang, host=host, seats=[], pair=None, seq=0, tvs=new_arrangement(avoid)), host


def add_seat(g):
    if len(g['seats']) >= MAX_SEATS:
        raise GameError(f'This room is full ({MAX_SEATS} screens).')
    seat = dict(id=str(uuid.uuid4()), token=secrets.token_urlsafe(32))
    g['seats'].append(seat)
    return seat


def authenticate(g, sid, token):
    for s in [g['host']] + g['seats']:
        if s['id'] == sid and secrets.compare_digest(s['token'], token or ''):
            return s
    raise GameError('Your session could not be verified.')


def press(g, seq):
    """Host pressed NEXT while looking at pair number `seq`. Returns True if the pair changed."""
    if seq != g['seq']:
        return False  # duplicate tap or stale screen: keep the current pair
    g['pair'] = new_pair(g['lang'], g['pair'])
    g['seq'] += 1
    return True


def view(g, sid):
    return dict(lang=g['lang'], pair=g['pair'], seq=g['seq'], host=sid == g['host']['id'], tvs=arrangement(g))
