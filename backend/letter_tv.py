"""Letter TV: two retro televisions, one random letter each. The game never judges answers.

The room only holds the current pair. The host's phone is the remote; every other phone
just watches. A press must name the pair it is replacing (seq), so a double tap or a
stale screen can never skip a pair.
"""
import secrets
import uuid

VERSION = 1
# Letter sets by language. Arabic can be added here later; only English ships for now.
ALPHABETS = {'en': [chr(c) for c in range(ord('A'), ord('Z') + 1)]}
LANGS = tuple(ALPHABETS)
MAX_SEATS = 24


class GameError(ValueError):
    pass


def new_pair(lang='en', previous=None, rng=secrets.choice):
    letters = ALPHABETS[lang]
    while True:
        pair = [rng(letters), rng(letters)]
        if pair != previous:
            return pair


def new_room(lang='en'):
    if lang not in LANGS:
        raise GameError('Only English letters are available right now.')
    host = dict(id=str(uuid.uuid4()), token=secrets.token_urlsafe(32))
    return dict(v=VERSION, lang=lang, host=host, seats=[], pair=None, seq=0), host


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
    return dict(lang=g['lang'], pair=g['pair'], seq=g['seq'], host=sid == g['host']['id'])
