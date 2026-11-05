"""Clock Race studio: review rules, validation, jigsaw rules, sign-in and uploads (no web server needed)."""
import io
import random

import pytest
from PIL import Image

import clock_race as E
import clock_race_admin_auth as auth
import clock_race_assets as A
import clock_race_content as C


@pytest.fixture(autouse=True)
def fresh_live():
    C.LIVE.load(C.empty_state())
    yield
    C.LIVE.load(C.empty_state())


def picture_data(qid='b01'):
    return C.builtin()[qid][1]


# ------------------------------------------------------------------ catalogue

def test_catalogue_covers_every_bank():
    b = C.builtin()
    kinds = {t for t, _ in b.values()}
    assert kinds == set(C.EDITABLE_TYPES)
    assert sum(t == 'tile' for t, _ in b.values()) == len(E.TILE_SET)
    assert sum(t == 'photo' for t, _ in b.values()) == len(E.PHOTO_BANK)
    assert sum(t == 'price' for t, _ in b.values()) == len(E.PRICE_BANK)
    assert sum(t == 'vote' for t, _ in b.values()) == len(E.D.QUESTIONS)


def test_every_builtin_question_validates():
    for qid, (kind, data) in C.builtin().items():
        errors = [p for p in C.validate(kind, data, {}) if p['level'] == 'error']
        assert not errors, (qid, errors)


def test_untouched_builtins_stay_live_as_legacy():
    s = C.empty_state()
    rows = C.summary(s)
    assert all(r['live'] == 'legacy' and r['status'] == 'draft' for r in rows)
    assert C.live_counts(s)['belong'] == len(E.K.BY_KIND['belong'])


# ------------------------------------------------------------------ review and publish

def test_edit_does_not_change_live_until_published():
    s = C.empty_state()
    d = dict(picture_data('b01'), en='Edited question')
    C.save_draft(s, 'b01', d, 'khaled')
    C.LIVE.load(s)
    live = {x['id']: x for x in C.picture_bank('belong')}
    assert live['b01']['en'] == 'Which one is not made from sand?'
    C.set_status(s, 'b01', 'approved', 'khaled')
    C.LIVE.load(s)
    assert {x['id']: x for x in C.picture_bank('belong')}['b01']['en'] != 'Edited question'  # approved, not published
    rec = C.publish(s, 'khaled')
    C.LIVE.load(s)
    assert {x['id']: x for x in C.picture_bank('belong')}['b01']['en'] == 'Edited question'
    assert rec['by'] == 'khaled' and s['items']['b01']['published_by'] == 'khaled'


def test_editing_an_approved_item_keeps_the_live_version():
    s = C.empty_state()
    C.save_draft(s, 'b02', dict(picture_data('b02'), en='Version one'), 'k')
    C.set_status(s, 'b02', 'approved', 'k')
    C.publish(s, 'k')
    C.save_draft(s, 'b02', dict(picture_data('b02'), en='Version two'), 'k')
    e = C.view(s, 'b02')
    assert e['status'] == 'draft' and e['approved']['en'] == 'Version one' and e['live_data']['en'] == 'Version one'
    C.LIVE.load(s)
    assert {x['id']: x for x in C.picture_bank('belong')}['b02']['en'] == 'Version one'
    C.revert_draft(s, 'b02', 'k')
    assert s['items']['b02']['draft']['en'] == 'Version one' and s['items']['b02']['status'] == 'approved'


def test_rejected_questions_never_enter_new_rounds():
    s = C.empty_state()
    C.set_status(s, 'b01', 'rejected', 'k')
    C.set_status(s, 'p01', 'rejected', 'k')
    C.set_status(s, 'photo_car', 'rejected', 'k')
    C.publish(s, 'k')
    C.LIVE.load(s)
    E._TILE_DECK.clear()
    for n in range(80):
        tasks = E.gen_round([dict(id='a', name='A'), dict(id='b', name='B'), dict(id='c', name='C')], 'ar', rng=random.Random(n))
        for t in tasks:
            assert t.get('qid') not in ('b01', 'photo_car')
            if t['type'] == 'tile':
                assert t['pic'] != 'p01'


def test_new_question_live_only_after_approve_and_publish():
    s = C.empty_state()
    data = dict(ar='أي واحد مختلف؟', en='Which one is different?', options=[
        ['apple', 'تفاحة', 'Apple'], ['banana', 'موز', 'Banana'], ['carrot', 'جزر', 'Carrot'], ['burger', 'برجر', 'Burger']],
        difficulty='easy', fact='x', source='y')
    e = C.create(s, 'belong', data, 'k')
    C.LIVE.load(s)
    assert e['id'] not in {x['id'] for x in C.picture_bank('belong')}
    C.set_status(s, e['id'], 'approved', 'k')
    assert [p['id'] for p in C.pending(s)] == [e['id']]
    C.publish(s, 'k')
    C.LIVE.load(s)
    assert e['id'] in {x['id'] for x in C.picture_bank('belong')}


def test_publish_refuses_to_empty_a_type():
    s = C.empty_state()
    for qid in list(E.TILE_SET)[:-1]:
        C.set_status(s, qid, 'rejected', 'k')
    with pytest.raises(ValueError, match='Not enough live'):
        C.publish(s, 'k')


def test_revert_publish_restores_previous_live():
    s = C.empty_state()
    C.save_draft(s, 'w01', dict(picture_data('w01'), en='Changed'), 'k')
    C.set_status(s, 'w01', 'approved', 'k')
    C.set_status(s, 'w02', 'rejected', 'k')
    rec = C.publish(s, 'k')
    C.revert_publish(s, rec['rev'], 'k')
    C.LIVE.load(s)
    live = {x['id']: x for x in C.picture_bank('which')}
    assert live['w01']['en'] == picture_data('w01')['en'] and 'w02' in live
    assert C.pending(s) == []  # nothing waiting to be re-published after a revert
    with pytest.raises(ValueError):
        C.revert_publish(s, rec['rev'], 'k')


def test_approve_blocked_by_errors_and_bulk_skips():
    s = C.empty_state()
    C.save_draft(s, 'b03', dict(picture_data('b03'), ar='English only'), 'k')
    with pytest.raises(ValueError, match='Arabic'):
        C.set_status(s, 'b03', 'approved', 'k')


def test_nothing_to_publish():
    with pytest.raises(ValueError):
        C.publish(C.empty_state(), 'k')


# ------------------------------------------------------------------ validation

@pytest.mark.parametrize('change,msg', [
    (lambda d: d.update(options=d['options'][:3]), 'exactly 4'),
    (lambda d: d['options'][1].__setitem__(0, d['options'][0][0]), 'same picture'),
    (lambda d: d['options'][1].__setitem__(2, d['options'][0][2]), 'same name'),
    (lambda d: d['options'][2].__setitem__(1, ''), 'Arabic name'),
    (lambda d: d['options'][2].__setitem__(0, 'no_such_art_key'), 'picture missing'),
    (lambda d: d.update(en=''), 'English question'),
])
def test_picture_validation(change, msg):
    import copy
    d = copy.deepcopy(picture_data('b01'))
    change(d)
    errors = [p['msg'] for p in C.validate('belong', d, {}) if p['level'] == 'error']
    assert any(msg in m for m in errors), errors


def test_price_tie_is_an_error():
    d = C.normalize('price', dict(options=[
        dict(key='tourbillon', ar='أ', en='A', unit_usd=100, quantity=2, source='s'),
        dict(key='cullinan', ar='ب', en='B', unit_usd=200, quantity=1, source='s')]))
    assert any('same' in p['msg'] for p in C.validate('price', d, {}))


def test_asset_references_must_exist():
    d = dict(picture_data('w01'))
    d = C.normalize('which', dict(d, options=[['asset:abcdef1234567890abcd', 'فهد', 'Cheetah'], d['options'][1]]))
    assert any('missing' in p['msg'] for p in C.validate('which', d, {}))
    assert not [p for p in C.validate('which', d, {'abcdef1234567890abcd': {'url': 'x'}}) if p['level'] == 'error']


def test_normalize_drops_unknown_fields():
    d = C.normalize('vote', dict(ar='سؤال', en='Q', evil='<script>'))
    assert d == dict(ar='سؤال', en='Q')


# ------------------------------------------------------------------ jigsaw rules

def test_transform_equivalences():
    assert C.transform_key(['H', 90]) == C.transform_key(['V', 270])
    assert C.transform_key(['H', 0]) == C.transform_key(['V', 180])
    assert C.transform_key(['none', 90]) != C.transform_key(['H', 90])


def test_existing_tile_sets_follow_the_rules():
    for pic, opts in E.TILE_SET.items():
        d = dict(pic=pic, opts=[list(o) for o in opts], grid=3)
        errors = [p for p in C.validate_tile(d, {}) if p['level'] == 'error']
        assert not errors, (pic, errors)


def test_duplicate_equivalent_pieces_flagged():
    d = dict(pic='p01', opts=[['none', 90], ['H', 90], ['V', 270], ['H', 180]], grid=3)
    assert any('identical' in p['msg'] for p in C.validate_tile(d, {}))
    d['opts'] = [['none', 90], ['none', 180], ['H', 90], ['V', 90]]
    assert any('un-mirrored' in p['msg'] for p in C.validate_tile(d, {}))


@pytest.mark.parametrize('seed', range(30))
def test_generated_pieces(seed):
    opts, sym = C.gen_tile_opts(random.Random(seed))
    assert not sym and len(opts) == 4
    right = [o for o in opts if o[0] == 'none']
    assert len(right) == 1 and right[0][1] in (90, 180, 270)
    assert len({C.transform_key(o) for o in opts}) == 4
    flips = sorted(o[0] for o in opts if o[0] != 'none')
    assert flips in (['H', 'H', 'V'], ['H', 'V', 'V'])


def _photo(w=1200, h=900):
    img = Image.new('RGB', (w, h))
    px = img.load()
    for x in range(w):
        for y in range(h):
            px[x, y] = ((x * 7) % 256, (y * 3) % 256, (x * y) % 256)
    return img


def test_render_tile_cuts_the_bottom_right_cell():
    src = _photo()
    puzzle, piece, square = C.render_tile(src, dict(x=100, y=50, size=800), grid=3)
    assert puzzle.size == (900, 900) and piece.size == (300, 300) and square.size == (900, 900)
    assert puzzle.getpixel((800, 800)) == C.HOLE_COLOR
    assert square.crop((600, 600, 900, 900)).tobytes() == piece.tobytes()
    _, piece2, _ = C.render_tile(src, dict(x=0, y=0, size=800), grid=2)
    assert piece2.size == (450, 450)


def test_symmetric_piece_is_flagged():
    flat = Image.new('RGB', (300, 300), (120, 160, 200))
    opts, sym = C.gen_tile_opts(random.Random(1), piece=flat, tries=5)
    assert sym is True
    busy = _photo(300, 300)
    opts, sym = C.gen_tile_opts(random.Random(1), piece=busy)
    assert sym is False


def test_studio_tiles_reach_the_game_with_urls():
    s = C.empty_state()
    s['assets'] = {'aaaaaaaaaaaaaaaaaaaa': dict(url='https://cdn/x.webp'), 'bbbbbbbbbbbbbbbbbbbb': dict(url='https://cdn/y.webp'),
                   'cccccccccccccccccccc': dict(url='https://cdn/src.webp')}
    e = C.create(s, 'tile', dict(source='asset:cccccccccccccccccccc', crop=dict(x=0, y=0, size=500), grid=3,
                                 opts=[['none', 90], ['H', 90], ['H', 270], ['V', 180]],
                                 rendered=dict(img='asset:aaaaaaaaaaaaaaaaaaaa', piece='asset:bbbbbbbbbbbbbbbbbbbb')), 'k')
    C.set_status(s, e['id'], 'approved', 'k')
    for pic in list(E.TILE_SET):
        C.set_status(s, pic, 'rejected', 'k')
    with pytest.raises(ValueError):  # one puzzle alone is below the minimum
        C.publish(s, 'k')
    C.set_status(s, 'p01', 'draft', 'k')  # p01 stays legacy-live
    C.publish(s, 'k')
    C.LIVE.load(s)
    E._TILE_DECK.clear()
    seen = set()
    for n in range(20):
        t = E.gen_tile(random.Random(n), 'ar')
        seen.add(t['pic'])
        if t['pic'] == e['id']:
            assert t['img'] == 'https://cdn/x.webp' and t['piece'] == 'https://cdn/y.webp'
            assert t['opts'][t['answer']][0] == 'none'
    assert seen == {e['id'], 'p01'}


def test_vote_questions_carry_their_text():
    s = C.empty_state()
    C.save_draft(s, 'v01', dict(ar='منو أطيب واحد؟', en='Who is the kindest?'), 'k')
    C.set_status(s, 'v01', 'approved', 'k')
    C.publish(s, 'k')
    C.LIVE.load(s)
    texts = {tuple(E.gen_vote(random.Random(n), [dict(id='a', name='A')])['text']) for n in range(200)}
    assert ('منو أطيب واحد؟', 'Who is the kindest?') in texts
    assert E.vote_text(dict(type='vote', question=0), 1) == E.D.QUESTIONS[0][1]  # rounds made before the studio


def test_preview_task_matches_game_shape():
    for qid in ('b01', 'price_hypercars', 'photo_bigben', 'p03', 'v02'):
        kind, data = C.builtin()[qid]
        t = C.preview_task(kind, data, {})
        assert t['type'] == ('vote' if kind == 'vote' else kind)
        if 'answer' in t and kind != 'tile':
            assert 0 <= t['answer'] < len(t['options'])


# ------------------------------------------------------------------ sign-in

ENV = {'CLOCK_RACE_ADMINS': 'khaled:correct-horse-battery,partner:another-long-pass', 'SUPABASE_SERVICE_ROLE_KEY': 'k'}


def test_login_and_token():
    lim = auth.Limiter()
    name, token = auth.login('correct-horse-battery', '1.2.3.4', lim, ENV)
    assert name == 'khaled' and auth.verify(token, ENV) == 'khaled'
    with pytest.raises(auth.AuthError) as e:
        auth.login('wrong', '1.2.3.4', lim, ENV)
    assert e.value.status == 401


def test_tampered_and_expired_tokens_rejected():
    token = auth.issue('khaled', ENV, now=1000)
    with pytest.raises(auth.AuthError):
        auth.verify(token, ENV, now=1000 + auth.TOKEN_HOURS * 3600 + 1)
    body, sig = auth.issue('khaled', ENV).split('.')
    with pytest.raises(auth.AuthError):
        auth.verify(body + '.' + sig[:-2] + 'xx', ENV)
    forged = auth.issue('khaled', dict(ENV, SUPABASE_SERVICE_ROLE_KEY='other'))
    with pytest.raises(auth.AuthError):
        auth.verify(forged, ENV)
    removed = auth.issue('partner', ENV)
    with pytest.raises(auth.AuthError):
        auth.verify(removed, dict(ENV, CLOCK_RACE_ADMINS='khaled:correct-horse-battery'))


def test_rate_limit():
    lim = auth.Limiter()
    for _ in range(auth.FAIL_LIMIT):
        with pytest.raises(auth.AuthError):
            auth.login('nope', '9.9.9.9', lim, ENV)
    with pytest.raises(auth.AuthError) as e:
        auth.login('correct-horse-battery', '9.9.9.9', lim, ENV)
    assert e.value.status == 429


def test_closed_without_a_real_password():
    assert auth.admins({'ADMIN_PASSWORD': 'admin123'}) == {}
    assert auth.admins({}) == {}
    assert auth.admins({'CLOCK_RACE_ADMINS': 'k:short'}) == {}
    with pytest.raises(auth.AuthError) as e:
        auth.login('admin123', 'x', auth.Limiter(), {'ADMIN_PASSWORD': 'admin123', 'SUPABASE_KEY': 'k'})
    assert e.value.status == 503
    assert auth.admins({'ADMIN_PASSWORD': 'a-really-set-password'}) == {'admin': 'a-really-set-password'}


# ------------------------------------------------------------------ uploads

def _bytes(fmt, size=(640, 480)):
    buf = io.BytesIO()
    Image.new('RGB', size, (200, 10, 10)).save(buf, fmt)
    return buf.getvalue()


@pytest.mark.parametrize('fmt,mime', [('JPEG', 'image/jpeg'), ('PNG', 'image/png'), ('WEBP', 'image/webp')])
def test_accepts_jpg_png_webp(fmt, mime):
    img, info = A.inspect(_bytes(fmt), 'x')
    assert info['mime'] == mime and (info['w'], info['h']) == (640, 480)
    v = A.variants(img)
    assert Image.open(io.BytesIO(v['thumb'])).size[0] <= A.THUMB_SIDE
    assert Image.open(io.BytesIO(v['player'])).format == 'WEBP'


@pytest.mark.parametrize('data,msg', [
    (b'', 'empty'),
    (b'<svg xmlns="http://www.w3.org/2000/svg"/>', 'not a readable image'),
    (b'GIF89a' + b'\x00' * 100, 'not a readable image'),
])
def test_rejects_non_images(data, msg):
    with pytest.raises(A.AssetError, match=msg):
        A.inspect(data, 'f')


def test_rejects_gif_tiny_and_huge():
    buf = io.BytesIO()
    Image.new('RGB', (400, 400)).save(buf, 'GIF')
    with pytest.raises(A.AssetError, match='only JPG'):
        A.inspect(buf.getvalue(), 'f.gif')
    with pytest.raises(A.AssetError, match='too small'):
        A.inspect(_bytes('PNG', (100, 400)), 'f')
    with pytest.raises(A.AssetError, match='over'):
        A.inspect(b'x' * (A.MAX_BYTES + 1), 'f')


def test_upload_is_stored_with_stable_id_and_credit():
    import asyncio

    class FakeStore:
        def __init__(self): self.files = {}
        async def put(self, path, data, mime):
            self.files[path] = data
            return f'/api/clock-race/asset/{path}', 'db'

    st = FakeStore()
    data = _bytes('JPEG')
    rec = asyncio.run(A.save_upload(st, data, 'eiffel.jpg', 'khaled', dict(source='Wikimedia', license='CC BY-SA 4.0')))
    rec2 = asyncio.run(A.save_upload(st, data, 'again.jpg', 'khaled'))
    assert rec['id'] == rec2['id']
    assert st.files[f'{rec["id"]}/original.jpg'] == data  # original kept untouched
    assert {f'{rec["id"]}/player.webp', f'{rec["id"]}/thumb.webp'} <= set(st.files)
    assert rec['credit'] == dict(source='Wikimedia', license='CC BY-SA 4.0') and rec['uploaded_by'] == 'khaled'
