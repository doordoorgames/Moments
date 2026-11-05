"""Pictures uploaded in the Clock Race studio.

Every upload is checked on the server (real JPG / PNG / WebP, size and dimension limits), then kept three
ways: the untouched original, an optimised WebP the game shows, and a small WebP thumbnail for the studio.
Nothing is ever deleted: rejecting or replacing a question only stops pointing at a picture.

Storage: the project's Supabase Storage (public bucket `clock-race-assets`) when the server's key may
use it; otherwise the pictures go into reserved rows of the existing `rooms` table and the backend serves
them at /api/clock-race/asset/<id>/<variant>. Either way an asset's url never changes.
"""
from __future__ import annotations

import base64
import hashlib
import io
import logging

from PIL import Image, ImageOps, UnidentifiedImageError

log = logging.getLogger(__name__)

MAX_BYTES = 12 * 1024 * 1024
MIN_SIDE = 200
MAX_SIDE = 10000
MAX_PIXELS = 60_000_000
FORMATS = {'JPEG': ('image/jpeg', 'jpg'), 'PNG': ('image/png', 'png'), 'WEBP': ('image/webp', 'webp')}
PLAYER_SIDE = 1600
THUMB_SIDE = 360
BUCKET = 'clock-race-assets'
DB_PREFIX = 'crasset:'
DB_ORIGINAL_MAX = 4 * 1024 * 1024  # the rooms-table fallback keeps originals up to this size


class AssetError(ValueError):
    pass


def inspect(data: bytes, filename: str = ''):
    """Check an upload. Returns (pil_image, info) or raises AssetError with a readable reason."""
    if not data:
        raise AssetError(f'{filename or "File"} is empty.')
    if len(data) > MAX_BYTES:
        raise AssetError(f'{filename or "File"} is over {MAX_BYTES // (1024 * 1024)} MB.')
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        probe.verify()
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError):
        raise AssetError(f'{filename or "File"} is not a readable image.') from None
    if fmt not in FORMATS:
        raise AssetError(f'{filename or "File"}: only JPG, PNG and WebP are accepted (got {fmt}).')
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    if min(w, h) < MIN_SIDE:
        raise AssetError(f'{filename or "File"} is too small ({w}x{h}); at least {MIN_SIDE}px each side.')
    if max(w, h) > MAX_SIDE or w * h > MAX_PIXELS:
        raise AssetError(f'{filename or "File"} is too large ({w}x{h}).')
    mime, ext = FORMATS[fmt]
    return img, dict(w=w, h=h, mime=mime, ext=ext, bytes=len(data), sha=hashlib.sha256(data).hexdigest())


def _rgb(img):
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        return bg
    return img.convert('RGB')


def variants(img):
    """{'player': webp bytes, 'thumb': webp bytes} without touching the original."""
    base = _rgb(img)
    out = {}
    for name, side, q in (('player', PLAYER_SIDE, 82), ('thumb', THUMB_SIDE, 75)):
        v = base.copy()
        v.thumbnail((side, side), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        v.save(buf, 'WEBP', quality=q, method=5)
        out[name] = buf.getvalue()
    return out


class Store:
    """Puts bytes somewhere public. `put` returns the url (absolute, or /api/... on this backend)."""

    def __init__(self, db, query):
        self.db, self.query = db, query
        self.bucket_ok = None

    async def _bucket(self):
        if self.bucket_ok is not None:
            return self.bucket_ok
        try:
            storage = self.db().storage
            try:
                await self.query(lambda: storage.get_bucket(BUCKET))
            except Exception:
                await self.query(lambda: storage.create_bucket(BUCKET, options={'public': True}))
            self.bucket_ok = True
        except Exception as exc:  # anon key or storage disabled: use the rooms-table fallback
            log.warning('Clock Race studio: Supabase Storage unavailable (%s); storing pictures in the database', exc)
            self.bucket_ok = False
        return self.bucket_ok

    async def put(self, path, data, mime):
        if await self._bucket():
            try:
                bucket = self.db().storage.from_(BUCKET)
                await self.query(lambda: bucket.upload(path, data, file_options={'content-type': mime, 'upsert': 'true',
                                                                                 'cache-control': '31536000'}))
                return await self.query(lambda: bucket.get_public_url(path)), 'storage'
            except Exception as exc:
                log.warning('Clock Race studio: upload to storage failed (%s); using the database', exc)
        code = DB_PREFIX + path
        row = [dict(mime=mime, b64=base64.b64encode(data).decode())]
        existing = await self.query(lambda: self.db().table('rooms').select('code').eq('code', code).maybe_single().execute())
        if existing and existing.data:
            await self.query(lambda: self.db().table('rooms').update({'flags': row}).eq('code', code).execute())
        else:
            await self.query(lambda: self.db().table('rooms').insert({'code': code, 'flags': row, 'created_at': ''}).execute())
        return f'/api/clock-race/asset/{path}', 'db'

    async def get_db(self, path):
        code = DB_PREFIX + path
        res = await self.query(lambda: self.db().table('rooms').select('flags').eq('code', code).maybe_single().execute())
        flags = res.data.get('flags') if res and res.data else None
        if not flags or not isinstance(flags[0], dict) or 'b64' not in flags[0]:
            return None
        return base64.b64decode(flags[0]['b64']), flags[0].get('mime') or 'image/webp'


async def save_upload(store, data, filename, who, credit=None, now=''):
    """Check, convert and store one upload. Returns the asset record (id is stable for the same bytes)."""
    img, info = inspect(data, filename)
    aid = info['sha'][:20]
    v = variants(img)
    urls = {}
    where = None
    for name, blob, mime in (('player', v['player'], 'image/webp'), ('thumb', v['thumb'], 'image/webp')):
        urls[name], where = await store.put(f'{aid}/{name}.webp', blob, mime)
    orig_url = None
    if where == 'storage' or info['bytes'] <= DB_ORIGINAL_MAX:
        orig_url, _ = await store.put(f'{aid}/original.{info["ext"]}', data, info['mime'])
    return dict(id=aid, url=urls['player'], thumb=urls['thumb'], original=orig_url, w=info['w'], h=info['h'],
                mime=info['mime'], bytes=info['bytes'], name=(filename or '')[:120], store=where,
                credit=clean_credit(credit), uploaded_by=who, uploaded_at=now, kind='upload')


async def save_rendered(store, aid, blob, who, kind, now='', w=0, h=0):
    url, where = await store.put(f'{aid}/player.webp', blob, 'image/webp')
    thumb_img = Image.open(io.BytesIO(blob))
    thumb_img.thumbnail((THUMB_SIDE, THUMB_SIDE))
    buf = io.BytesIO()
    thumb_img.save(buf, 'WEBP', quality=75)
    thumb, _ = await store.put(f'{aid}/thumb.webp', buf.getvalue(), 'image/webp')
    return dict(id=aid, url=url, thumb=thumb, original=None, w=w, h=h, mime='image/webp', bytes=len(blob), name=kind,
                store=where, credit={}, uploaded_by=who, uploaded_at=now, kind=kind)


def clean_credit(c):
    c = c if isinstance(c, dict) else {}
    return {k: str(c.get(k) or '').strip()[:300] for k in ('source', 'license', 'author', 'note') if c.get(k)}
