"""Arabic Word Rush: generation, normalisation, regional vocabulary and the strict letter rules."""
import random
from collections import Counter

import pytest

import clock_race as E
import clock_race_ar as AR


def fruit(letter):
    return dict(type='word', variant='fruit', lang='ar', letter=letter)


def country(letter):
    return dict(type='word', variant='country', lang='ar', letter=letter)


def pair(first, last):
    return dict(type='word', variant='pair', lang='ar', first=first, last=last)


def ok(task, text):
    return E.check_word(task, text)[0]


# ------------------------------------------------------------------ generation

def test_arabic_rooms_get_arabic_word_tasks_and_english_rooms_do_not():
    rng = random.Random(1)
    for _ in range(300):
        for variant in ('pair', 'country', 'fruit'):
            t = E.gen_word(rng, 'ar', variant)
            assert t['lang'] == 'ar'
            letters = [t['first'], t['last']] if variant == 'pair' else [t['letter']]
            assert all(len(c) == 1 and 'ء' <= c <= 'ي' for c in letters)
            e = E.gen_word(rng, 'en', variant)
            assert 'lang' not in e
            letters = [e['first'], e['last']] if variant == 'pair' else [e['letter']]
            assert all('A' <= c <= 'Z' for c in letters)


def test_every_arabic_round_word_task_is_arabic():
    for s in range(200):
        for t in E.gen_round([dict(id='a', name='A')], 'ar', rng=random.Random(s)):
            if t['type'] == 'word':
                assert t['lang'] == 'ar'


@pytest.mark.parametrize('letter', AR.FRUIT_LETTERS)
def test_every_fruit_letter_has_several_familiar_fruits(letter):
    names = set(AR.candidates(fruit(letter)).values())
    assert len(names) >= 3, (letter, names)


@pytest.mark.parametrize('letter', AR.COUNTRY_LETTERS)
def test_every_country_letter_has_several_countries(letter):
    names = set(AR.candidates(country(letter)).values())
    assert len(names) >= 4, (letter, names)


@pytest.mark.parametrize('first,last', AR.PAIR_LIST)
def test_every_pair_has_everyday_answers(first, last):
    words = AR.PAIRS[(first, last)]
    assert len(words) >= 4
    for w in words:
        n = AR.norm(w)
        assert n[0] == first and n[-1] == last
        assert ok(pair(first, last), w)
    assert first not in 'هة' and last not in 'هةاى'          # no letters with spelling ambiguity at the ends


def test_solver_gives_a_real_arabic_answer():
    rng = random.Random(3)
    for variant in ('pair', 'country', 'fruit'):
        for _ in range(100):
            t = E.gen_word(rng, 'ar', variant)
            assert ok(t, E.solve(t, []))


# ------------------------------------------------------------------ normalisation

def test_normalisation():
    assert AR.norm('أَنَاناس') == 'اناناس'
    assert AR.norm('إجّاص') == 'اجاص'
    assert AR.norm('آيسلندا') == 'ايسلندا'
    assert AR.norm('بـــرتـقـال') == 'برتقال'              # tatweel
    assert AR.norm('  ب ر تقال ') == 'برتقال'               # stray spaces
    assert AR.norm('جوافة') == AR.norm('جوافه')
    assert AR.norm('كمثرى') == AR.norm('كمثري')
    assert AR.norm('رگي') == 'ركي'
    assert AR.norm('بئر') == 'بير'


# ------------------------------------------------------------------ fruits

@pytest.mark.parametrize('text', ['برتقال', 'بطيخ', 'برقوق', 'البرتقال', 'برتقالة', 'بـرتـقـال', ' برتقال ', 'بُرتُقال', 'بلح'])
def test_fruit_b_accepts(text):
    assert ok(fruit('ب'), text)


@pytest.mark.parametrize('text', ['رقي', 'ركي', 'رگي', 'رقية', 'الرقي', 'رمان', 'رطب'])
def test_watermelon_regional_spellings(text):
    assert ok(fruit('ر'), text)


@pytest.mark.parametrize('letter,text', [
    ('ب', 'بطيخ'),        # watermelon, standard
    ('ك', 'كنار'),        # Kuwaiti: sidr fruit
    ('م', 'منقا'),        # Gulf: mango
    ('م', 'منگا'),
    ('ع', None),          # placeholder so the table stays aligned
    ('ل', 'لالنگي'),      # Iraqi: mandarin
    ('ع', 'عنبة'),        # Iraqi: mango
    ('ش', 'شمام'),        # melon
    ('ا', 'إسكدنيا'),     # Gulf: loquat
    ('ف', 'فراولة'),
    ('ف', 'فراوله'),
    ('ج', 'جوافه'),
    ('ك', 'كمثرى'),
    ('ك', 'كمثري'),
    ('ا', 'أناناس'),
    ('ا', 'اناناس'),
])
def test_regional_and_standard_fruits(letter, text):
    if text:
        assert ok(fruit(letter), text)


@pytest.mark.parametrize('letter,text', [
    ('ب', 'بيت'),          # a real word, not a fruit
    ('ب', 'بصل'),          # a vegetable
    ('ب', 'بباب'),         # made up
    ('ب', 'بسسس'),
    ('ب', 'موز'),          # a fruit, wrong letter
    ('ب', 'orange'),       # English in an Arabic room
    ('ب', 'b'),
    ('ر', 'رز'),           # rice
    ('ت', 'تلفون'),
])
def test_fruit_rejects_wrong_category_letter_and_nonsense(letter, text):
    assert not ok(fruit(letter), text)


def test_fruit_typo_in_the_middle_only():
    assert ok(fruit('ب'), 'برتفال')          # one wrong middle letter
    assert ok(fruit('ب'), 'برقال')           # one missing middle letter (برتقال)
    assert ok(fruit('ب'), 'بررتقال')         # one extra middle letter
    assert not ok(fruit('ب'), 'نرتقال')      # wrong first letter is never forgiven
    assert not ok(fruit('ب'), 'برتقاب')      # last letter changed
    assert not ok(fruit('ب'), 'بقتفال')      # two slips


# ------------------------------------------------------------------ countries

@pytest.mark.parametrize('letter,text', [
    ('ك', 'الكويت'), ('ك', 'كويت'), ('ك', 'كندا'), ('س', 'السعودية'), ('س', 'السعوديه'), ('س', 'سعودية'),
    ('ا', 'الإمارات'), ('ا', 'الامارات'), ('ا', 'ألمانيا'), ('ا', 'المانيا'), ('ا', 'أمريكا'), ('ا', 'اميركا'),
    ('ب', 'البحرين'), ('ب', 'بريطانيا'), ('م', 'مصر'), ('م', 'المغرب'), ('ت', 'تركيا'), ('ه', 'الهند'), ('ه', 'هولندا'),
    ('ف', 'فرنسا'), ('ن', 'النرويج'), ('س', 'سويسرا'),
])
def test_countries_accept_with_or_without_article(letter, text):
    assert ok(country(letter), text)


@pytest.mark.parametrize('letter,text', [
    ('ك', 'كيك'), ('ك', 'الكلب'), ('ا', 'الكويت'),     # الكويت counts under ك, not ا
    ('م', 'مكة'),                                       # a city
    ('ب', 'بيروت'),                                     # a city
    ('س', 'kuwait'),
])
def test_countries_reject(letter, text):
    assert not ok(country(letter), text)


def test_country_typo():
    assert ok(country('ا'), 'ايطاليه')        # spelling variant via ة/ه and one slip
    assert ok(country('ب'), 'البرتعال')       # one wrong middle letter
    assert not ok(country('ب'), 'نرتغال')


# ------------------------------------------------------------------ start and end letters

@pytest.mark.parametrize('text', ['مطر', 'ممر', 'منبر', 'مسمار', 'منظر', 'مدير', 'المطر'[2:], 'مُطَر', 'مختبر', 'مطار', 'مشهور'])
def test_pair_m_r_accepts_real_words(text):
    assert ok(pair('م', 'ر'), text)


def test_pair_interior_slips():
    t = pair('م', 'ر')
    assert ok(t, 'مبر')           # منبر with one interior letter missing
    assert ok(t, 'منببر')         # one extra interior letter
    assert ok(t, 'مخطبر')         # one wrong interior letter in a longer word (مختبر)
    assert ok(t, 'مسمر')          # one missing interior letter (مسمار)
    assert ok(t, 'منابر')         # a real word, still starts with م and ends with ر


@pytest.mark.parametrize('text', [
    'نبر',       # wrong first letter
    'منبرة',     # wrong last letter (ه)
    'منبري',     # wrong last letter
    'مطرب',      # real word, wrong last letter
    'مسسسر',     # right ends, nonsense middle
    'مكككر',
    'مخر',       # three letters: no slip forgiven against 3-letter words
    'منثر',      # one changed letter in a 4-letter word is not guessed
    'مر',        # too short to be a start-and-end answer
    'mtr',
])
def test_pair_rejects(text):
    assert not ok(pair('م', 'ر'), text)


def test_pair_random_strings_with_right_ends_are_rejected():
    rng = random.Random(9)
    letters = list('ابتثجحخدذرزسشصضطظعغفقكلمنهوي')
    accepted = 0
    for _ in range(4000):
        f, l = rng.choice(AR.PAIR_LIST)
        mid = ''.join(rng.choice(letters) for _ in range(rng.randint(2, 4)))
        accepted += ok(pair(f, l), f + mid + l)
    assert accepted / 4000 < 0.02, accepted


def test_kuwaiti_words_count():
    assert ok(pair('ب', 'ت'), 'بلوت')
    assert ok(pair('ش', 'ب'), 'شنب')
    assert ok(pair('ع', 'ل'), 'عيال')
    assert ok(pair('ط', 'ر'), 'طبشور')
    assert ok(pair('ب', 'ر'), 'بئر') and ok(pair('ب', 'ر'), 'بير')


def test_english_word_rush_unchanged():
    t = E.gen_word(random.Random(1), 'en', 'fruit')
    assert 'lang' not in t
    assert ok(dict(type='word', variant='fruit', letter='B'), 'banana')
    assert ok(dict(type='word', variant='pair', first='C', last='T'), 'cat')
    assert not ok(dict(type='word', variant='fruit', letter='B'), 'برتقال')
