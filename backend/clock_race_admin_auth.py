"""Sign-in for the Clock Race studio (/admin/clock-race): one password, checked only on the server.

The password lives only as a PBKDF2 hash here (DEFAULT_HASH), checked on the server, never in the frontend.
CLOCK_RACE_ADMIN_PASSWORD / _HASH on Railway are no longer used. Extra named admins can still be added with
    CLOCK_RACE_ADMINS="khaled:pass-one,partner:pass-two"

Only the hash of the password lives here (DEFAULT_HASH),
not the password itself. To make a new hash: python -c "import clock_race_admin_auth as a; print(a.make_hash('...'))"

A successful sign-in returns a signed token (HMAC-SHA256, 12 hours). Signing key: CLOCK_RACE_ADMIN_SECRET,
or else one derived from the Supabase service key, which never leaves the server. Repeated wrong
passwords from one address are slowed down (5 tries per 10 minutes).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from collections import defaultdict, deque

TOKEN_HOURS = 12
MIN_PASSWORD = 6
FAIL_WINDOW = 600
FAIL_LIMIT = 5
HASH_PREFIX = 'pbkdf2_sha256$'
HASH_ROUNDS = 310000
# The initial studio password (PBKDF2 hash only). Overridden by any of the variables above.
DEFAULT_HASH = 'pbkdf2_sha256$310000$dd98b7edf8d7f5a312b08b19e1b0660a$f27e0be4b4fba23d1d6f8053ac9370750c654f3e9eee8d1fc8f294ccca08f6d7'


def make_hash(password, salt=None, rounds=HASH_ROUNDS):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), rounds).hex()
    return f'{HASH_PREFIX}{rounds}${salt}${digest}'


def matches(password, stored):
    """Constant-time check of a typed password against a stored password or PBKDF2 hash."""
    password = password or ''
    if stored.startswith(HASH_PREFIX):
        try:
            rounds, salt, digest = stored[len(HASH_PREFIX):].split('$')
            got = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), int(rounds)).hex()
        except ValueError:
            return False
        return hmac.compare_digest(got, digest)
    return hmac.compare_digest(hashlib.sha256(password.encode()).digest(), hashlib.sha256(stored.encode()).digest())


class AuthError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


def admins(env=None):
    """{name: password} allowed to sign in."""
    env = os.environ if env is None else env
    out = {}
    for part in (env.get('CLOCK_RACE_ADMINS') or '').split(','):
        name, sep, pw = part.strip().partition(':')
        if sep and name.strip() and len(pw) >= MIN_PASSWORD:
            out[name.strip()[:40]] = pw
    # The studio password is fixed in code (DEFAULT_HASH). Old Railway password variables are ignored
    # on purpose, so a leftover generated password can't lock the owner out.
    out['admin'] = DEFAULT_HASH
    return out


def _secret(env=None):
    env = os.environ if env is None else env
    s = env.get('CLOCK_RACE_ADMIN_SECRET')
    if s and len(s) >= 16:
        return s.encode()
    base = env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('SUPABASE_KEY') or ''
    pw = '|'.join(sorted(f'{k}:{v}' for k, v in admins(env).items()))
    if not base and not pw:
        return None
    # Changing any admin password also signs everyone out.
    return hashlib.sha256(('clock-race-admin:' + base + ':' + pw).encode()).digest()


def _b64(b):
    return base64.urlsafe_b64encode(b).decode().rstrip('=')


def _unb64(s):
    return base64.urlsafe_b64decode(s + '=' * (-len(s) % 4))


def issue(name, env=None, now=None):
    key = _secret(env)
    if not key:
        raise AuthError(503, 'The studio is not configured on the server.')
    body = _b64(json.dumps(dict(n=name, e=int((now or time.time()) + TOKEN_HOURS * 3600), s='clock-race')).encode())
    sig = _b64(hmac.new(key, body.encode(), hashlib.sha256).digest())
    return f'{body}.{sig}'


def verify(token, env=None, now=None):
    """The admin name in a valid token, else AuthError(401)."""
    key = _secret(env)
    if not key or not admins(env):
        raise AuthError(503, 'The studio is not configured on the server.')
    try:
        body, sig = (token or '').split('.', 1)
        good = _b64(hmac.new(key, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(good, sig):
            raise ValueError
        data = json.loads(_unb64(body))
        if data.get('s') != 'clock-race' or data['e'] < (now or time.time()):
            raise ValueError
        if data['n'] not in admins(env):
            raise ValueError
        return data['n']
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise AuthError(401, 'Please sign in again.') from None


class Limiter:
    def __init__(self):
        self.fails = defaultdict(deque)

    def check(self, who, now=None):
        now = now or time.time()
        q = self.fails[who]
        while q and q[0] < now - FAIL_WINDOW:
            q.popleft()
        if len(q) >= FAIL_LIMIT:
            raise AuthError(429, 'Too many tries. Wait a few minutes.')

    def fail(self, who, now=None):
        self.fails[who].append(now or time.time())

    def clear(self, who):
        self.fails.pop(who, None)


def login(password, address, limiter, env=None, now=None):
    """Return (name, token) for a correct password. Constant-time compare against every admin."""
    allowed = admins(env)
    if not allowed:
        raise AuthError(503, 'The studio is not configured on the server. Set CLOCK_RACE_ADMIN_PASSWORD on Railway.')
    limiter.check(address, now)
    hit = None
    for name, stored in allowed.items():
        if matches(password, stored):
            hit = name
    if not hit:
        limiter.fail(address, now)
        raise AuthError(401, 'Wrong password.')
    limiter.clear(address)
    return hit, issue(hit, env, now)
