"""Emoji Rooftop engine: guess the title from emojis, first correct answer wins the round.

The schedule is derived from timestamps, so no background task is needed:
each round starts, spins for SPIN seconds, accepts guesses until it is solved or
GUESS seconds pass, then shows the answer for REVEAL seconds before the next one.
"""
import csv
import io
import re
import secrets
import unicodedata
import uuid

from emoji_clues import SEED_CSV

SPIN = 1.2
GUESS = 30.0
REVEAL = 4.0
INTRO = 2.0
MAX_PLAYERS = 12
MAX_ROUNDS = 50
ITEMS = 7  # random table items, drawn by the frontend


class GameError(ValueError):
    pass


# ------------------------------------------------------------------ clue bank

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


SEED = parse_csv(SEED_CSV)[0]


def to_csv(clues):
    out = io.StringIO()
    w = csv.writer(out, lineterminator='\n')
    w.writerow(['category', 'emojis', 'answer', 'aliases'])
    for c in clues:
        w.writerow([c['category'], c['emojis'], c['answer'], '|'.join(c.get('aliases') or [])])
    return out.getvalue()


# ------------------------------------------------------------------ matching

def normalize(text):
    text = unicodedata.normalize('NFKD', text or '')
    text = ''.join(ch for ch in text if not unicodedata.combining(ch)).casefold()
    text = text.replace('&', ' and ')
    text = re.sub(r'[^\w\s]', ' ', text)
    text = ' '.join(text.split())
    if text.startswith('the '):
        text = text[4:]
    return text.replace(' ', '')


def distance(a, b):
    if a == b:
        return 0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def allowed(length):
    # Generous on long titles, strict on short ones so "Up" can't match anything.
    if length <= 3:
        return 0
    if length <= 5:
        return 1
    if length <= 8:
        return 2
    return 3


def matches(guess, clue):
    g = normalize(guess)
    if not g:
        return False
    for option in [clue['answer'], *(clue.get('aliases') or [])]:
        a = normalize(option)
        if a and distance(g, a) <= allowed(len(a)):
            return True
    return False


# ------------------------------------------------------------------ players

def nickname(value):
    value = ' '.join((value or '').split())
    if not 1 <= len(value) <= 24:
        raise GameError('Use a nickname between 1 and 24 characters.')
    return value


def add_player(g, name):
    if len(g['players']) >= MAX_PLAYERS:
        raise GameError('This rooftop is full (12 players).')
    name = nickname(name)
    if any(p['name'].casefold() == name.casefold() for p in g['players']):
        raise GameError('That nickname is taken in this room.')
    p = dict(id=str(uuid.uuid4()), name=name, token=secrets.token_urlsafe(32))
    g['players'].append(p)
    g['version'] += 1
    return p


def authenticate(g, pid, token):
    for p in g['players']:
        if p['id'] == pid and secrets.compare_digest(p['token'], token or ''):
            return p
    raise GameError('Your session could not be verified. Use the device where you joined.')


def new_game(name, rounds):
    if not 1 <= int(rounds) <= MAX_ROUNDS:
        raise GameError(f'Choose between 1 and {MAX_ROUNDS} rounds.')
    g = dict(status='lobby', rounds=int(rounds), players=[], clues=[], solves=[], items=[],
             started_at=None, run=str(uuid.uuid4()), version=0)
    host = add_player(g, name)
    g['host'] = host['id']
    return g, host


# ------------------------------------------------------------------ schedule

def start(g, bank, now, rounds=None):
    if len(g['players']) < 2:
        raise GameError('Invite at least one friend first.')
    bank = [c for c in bank if c.get('emojis') and c.get('answer')]
    if not bank:
        raise GameError('The clue bank is empty.')
    if rounds is not None:
        if not 1 <= int(rounds) <= MAX_ROUNDS:
            raise GameError(f'Choose between 1 and {MAX_ROUNDS} rounds.')
        g['rounds'] = int(rounds)
    count = min(g['rounds'], len(bank))
    picks = secrets.SystemRandom().sample(range(len(bank)), count)
    g.update(status='active', clues=[dict(bank[i]) for i in picks], solves=[None] * count,
             items=[secrets.randbelow(ITEMS) for _ in range(count)],
             started_at=now + INTRO, run=str(uuid.uuid4()))
    g['version'] += 1


def schedule(g):
    out, t = [], g['started_at']
    for solve in g['solves']:
        end = solve['at'] if solve else t + SPIN + GUESS
        out.append((t, end))
        t = end + REVEAL
    return out


def position(g, now):
    """Returns (phase, round_index). Phases: lobby, intro, guessing, reveal, ended."""
    if g['status'] == 'lobby' or not g['solves']:
        return 'lobby', -1
    times = schedule(g)
    if now >= times[-1][1] + REVEAL:
        return 'ended', len(times) - 1
    if now < times[0][0]:
        return 'intro', 0
    index = max(i for i, (s, _) in enumerate(times) if s <= now)
    return ('guessing' if now < times[index][1] else 'reveal'), index


def guess(g, pid, text, round_index, run, now):
    """Returns 'correct', 'wrong', 'taken' or 'closed'."""
    if run != g['run']:
        return 'closed'
    phase, index = position(g, now)
    if phase != 'guessing' or index != round_index:
        return 'closed'
    start_at = schedule(g)[index][0]
    if now < start_at + SPIN - 0.3:
        return 'closed'
    if g['solves'][index]:
        return 'taken'
    if len((text or '').strip()) > 120 or not matches(text, g['clues'][index]):
        return 'wrong'
    g['solves'][index] = dict(by=pid, at=now, guess=' '.join(text.split())[:80])
    g['version'] += 1
    return 'correct'


def scores(g):
    s = {p['id']: 0 for p in g['players']}
    for solve in g['solves']:
        if solve and solve['by'] in s:
            s[solve['by']] += 1
    return s


def view(g, pid, now):
    phase, index = position(g, now)
    s = scores(g)
    v = dict(status='lobby' if phase == 'lobby' else 'ended' if phase == 'ended' else 'active',
             phase=phase, host=g['host'], me=pid, rounds=g['rounds'], run=g['run'], version=g['version'],
             now=now, total=len(g['solves']),
             players=[dict(id=p['id'], name=p['name'], score=s[p['id']]) for p in g['players']])
    if phase in ('lobby',):
        return v
    times = schedule(g)
    if phase == 'intro':
        v.update(round=0, starts_at=times[0][0])
        return v
    start_at, end_at = times[index]
    clue = g['clues'][index]
    solve = g['solves'][index]
    done = phase in ('reveal', 'ended')
    v.update(round=index, starts_at=start_at, ends_at=end_at, deadline=start_at + SPIN + GUESS,
             next_at=end_at + REVEAL, spin=SPIN, item=g['items'][index],
             clue=dict(category=clue['category'], emojis=clue['emojis']),
             answer=clue['answer'] if done else None,
             solved_by=solve['by'] if (solve and done) else None)
    return v
