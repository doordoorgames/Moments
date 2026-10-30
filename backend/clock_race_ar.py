"""Clock Race, Arabic Word Rush: vocabulary, normalisation and answer checking.

Arabic rooms ask in Arabic letters and accept Arabic answers, Kuwaiti / Gulf / Iraqi words included.

Normalisation (both the typed answer and every dictionary word):
  harakat, shadda, sukun, dagger alef and tatweel dropped; spaces, digits, punctuation and Latin dropped;
  أ إ آ ٱ -> ا,  ى -> ي,  ة -> ه,  ؤ -> و,  ئ -> ي,  ء dropped,
  Gulf / Iraqi / Persian letters: گ -> ك,  ڤ -> ف,  پ -> ب,  چ -> ج,  ژ -> ز,  ک -> ك,  ی -> ي.

Fruits and countries (category questions): the answer must be a real name in the curated list
(names plus regional aliases), so meaning and category are checked, not only the first letter.
"ال" in front is optional. One typing slip in the middle of a 4+ letter name is forgiven; the first
and last letters must be right, and a slip that could be two different names is not guessed.

Start-and-end letters: the typed word itself must start and end with the asked letters (never
forgiven). It must be a known Arabic word: the curated everyday list for the pair, or a frequent word
from the Arabic word-frequency list. One slip between the first and last letter is forgiven only
against the curated everyday list (4+ letters), so random strings with the right ends never pass.
"""
import os
import re

# ------------------------------------------------------------------ normalisation

_DROP = re.compile('[ؐ-ًؚ-ٰٟۖ-ۭـ]')   # harakat, Quranic marks, tatweel
_MAP = str.maketrans({
    'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي', 'ء': None,
    'گ': 'ك', 'ک': 'ك', 'ڤ': 'ف', 'پ': 'ب', 'چ': 'ج', 'ژ': 'ز', 'ی': 'ي', 'ۀ': 'ه', 'ہ': 'ه',
})
_LETTERS = set('ابتثجحخدذرزسشصضطظعغفقكلمنهوي')


def norm(text):
    """Arabic letters only, in one spelling (see the module docstring)."""
    text = _DROP.sub('', str(text or '')).translate(_MAP)
    return ''.join(c for c in text if c in _LETTERS)


def strip_article(word):
    return word[2:] if word.startswith('ال') and len(word) > 3 else word


def within_one(a, b):
    """Levenshtein distance <= 1."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    if len(a) > len(b):
        a, b = b, a
    i = 0
    while i < len(a) and a[i] == b[i]:
        i += 1
    return a[i + 1:] == b[i + 1:] if len(a) == len(b) else a[i:] == b[i + 1:]


def interior_slip(typed, word):
    """Same first and last letter, at most one missing / extra / wrong letter between them.
    Four-letter words forgive a missing or extra letter; a changed letter needs five or more letters
    (in a short word, swapping one of two middle letters too often makes another real word)."""
    if len(word) < 4 or len(typed) < 3 or typed[0] != word[0] or typed[-1] != word[-1]:
        return False
    if len(word) == 4 and len(typed) == 4:
        return typed == word
    return within_one(typed[1:-1], word[1:-1])


def loose(word):
    """Category names only: a final ه and a final ا are the same ending (ايطاليا / ايطاليه, جوافا / جوافه)."""
    return word[:-1] + 'ا' if word.endswith('ه') else word


# ------------------------------------------------------------------ fruits (name: regional names / spellings)
# Written the usual way; the article is optional when typed. Kuwaiti / Gulf / Iraqi names are first-class.

FRUITS = {
    'أناناس': ['اناناس', 'أناناسه'], 'أفوكادو': ['افوكادو', 'أفوكاتو', 'افوكاتو'], 'إجاص': ['انجاص', 'إنجاص'],
    'إسكدنيا': ['اسكدنيا', 'أكي دنيا', 'اكيدنيا'], 'أترج': ['اترج'],
    'برتقال': ['برتقاله', 'برتقان', 'برتقالة', 'بردقان', 'پرتقال'], 'بطيخ': ['بطيخه', 'بطيخة', 'بطيخ أحمر', 'بطيخ أصفر'],
    'برقوق': ['برقوقه'], 'بلح': ['بلحه'], 'بابايا': ['باباي', 'بباي'], 'بوملي': ['بوملو', 'بومالي'],
    'بمبر': [], 'بيذام': ['بيذان'],
    'تفاح': ['تفاحه', 'تفاحة'], 'تمر': ['تمره', 'تمور'], 'توت': ['توت أرضي', 'توت بري'], 'تين': ['تينه', 'تين شوكي'],
    'ترنج': ['ترنجه', 'أترنج'], 'تمر هندي': [],
    'جوافة': ['جوافه', 'جوافا', 'جوافاية'], 'جريب فروت': ['جريبفروت', 'كريب فروت', 'گريب فروت'], 'جوز الهند': ['جوز هند'],
    'خوخ': ['خوخه'], 'خلال': [], 'خربز': ['خربزه', 'خربزة'], 'خستاوي': [],
    'دراق': ['دراقن', 'دراقه'],
    'رمان': ['رمانه', 'رمانة'], 'رقي': ['ركي', 'رگي', 'رقيه', 'ركيه', 'رگيه'], 'رطب': ['رطبه'],
    'زبيب': [], 'زيتون': ['زيتونه'], 'زعرور': [],
    'سفرجل': ['سفرجله'],
    'شمام': ['شمامه', 'شمامة'], 'شليك': ['شليكه'],
    'عنب': [], 'عنبة': ['عنبه', 'عمبه', 'عنبا'], 'عناب': [],
    'فراولة': ['فراوله', 'فريز', 'فرولة', 'فراولا'],
    'قشطة': ['قشطه'],
    'كرز': ['كريز', 'گرز'], 'كيوي': ['كيوى', 'كيوي فروت'], 'كمثرى': ['كمثري', 'كمثرا'], 'كنار': ['كنار سدر'],
    'كاكا': ['كاكي'], 'كانتلوب': ['كنتالوب', 'كانتالوب', 'كانتلوبي'], 'كمكوات': [], 'كليمنتينا': ['كليمنتين'],
    'ليمون': ['ليمونه', 'لومي', 'ليم'], 'لالنكي': ['لالنگي', 'لالنكيه'], 'ليتشي': ['ليچي', 'لتشي'],
    'موز': ['موزه', 'موزة'], 'مانجو': ['منجا', 'منقا', 'منگا', 'مانجا', 'مانجه', 'مانغو', 'مانقو'],
    'مشمش': ['مشمشه', 'مشمشة'], 'مندلينا': ['مندرين', 'ماندرين', 'مندلين'], 'مانجوستين': [],
    'نبق': ['نبقه'], 'نارنج': ['نارنجه'], 'نكترين': ['نيكترين'],
    'يوسفي': ['يوسف أفندي', 'يوسفيه'],
}
# Letters with several everyday fruits (Arabic letter -> shown as is).
FRUIT_LETTERS = list('ابتجخرمكن')

# ------------------------------------------------------------------ countries

COUNTRIES = {
    'الكويت': [], 'السعودية': ['المملكة العربية السعودية', 'سعودية'], 'الإمارات': ['الامارات العربية المتحدة'],
    'قطر': [], 'البحرين': [], 'عمان': ['سلطنة عمان'], 'اليمن': [], 'العراق': [], 'الأردن': [], 'سوريا': ['سورية'],
    'لبنان': [], 'فلسطين': [], 'مصر': [], 'السودان': [], 'ليبيا': [], 'تونس': [], 'الجزائر': [], 'المغرب': [],
    'موريتانيا': [], 'الصومال': [], 'جيبوتي': [], 'جزر القمر': ['القمر'],
    'تركيا': [], 'إيران': [], 'باكستان': [], 'أفغانستان': [], 'الهند': [], 'بنغلاديش': ['بنجلاديش'], 'سريلانكا': [],
    'نيبال': [], 'الصين': [], 'اليابان': [], 'كوريا': ['كوريا الجنوبية', 'كوريا الشمالية'], 'تايلاند': ['تايلند'],
    'ماليزيا': [], 'إندونيسيا': [], 'الفلبين': [], 'سنغافورة': [], 'فيتنام': [], 'كمبوديا': [], 'منغوليا': [],
    'كازاخستان': [], 'أذربيجان': [], 'جورجيا': [], 'أرمينيا': [], 'المالديف': [],
    'بريطانيا': ['المملكة المتحدة', 'إنجلترا', 'انكلترا'], 'فرنسا': [], 'ألمانيا': [], 'إيطاليا': [], 'إسبانيا': [],
    'البرتغال': [], 'هولندا': [], 'بلجيكا': [], 'سويسرا': [], 'النمسا': [], 'السويد': [], 'النرويج': [],
    'الدنمارك': [], 'فنلندا': [], 'أيرلندا': ['ايرلندا'], 'اليونان': [], 'بولندا': [], 'روسيا': [], 'أوكرانيا': [],
    'رومانيا': [], 'هنغاريا': ['المجر'], 'التشيك': [], 'صربيا': [], 'كرواتيا': [], 'قبرص': [], 'مالطا': [],
    'ألبانيا': [], 'البوسنة': [], 'بلغاريا': [], 'آيسلندا': ['ايسلندا'], 'لوكسمبورغ': [], 'سلوفاكيا': [], 'هايتي': [], 'هندوراس': [],
    'أمريكا': ['الولايات المتحدة', 'أميركا', 'الولايات المتحدة الأمريكية'], 'كندا': [], 'المكسيك': [],
    'البرازيل': [], 'الأرجنتين': [], 'تشيلي': [], 'كولومبيا': [], 'بيرو': [], 'فنزويلا': [], 'كوبا': [],
    'جامايكا': [], 'الأوروغواي': ['اوروغواي'], 'الإكوادور': ['الاكوادور'], 'بوليفيا': [], 'باراغواي': [], 'بنما': [],
    'أستراليا': [], 'نيوزيلندا': [],
    'نيجيريا': [], 'كينيا': [], 'إثيوبيا': ['الحبشة'], 'غانا': [], 'السنغال': [], 'الكاميرون': [], 'تنزانيا': [],
    'أوغندا': [], 'جنوب أفريقيا': ['جنوب افريقيا'], 'مالي': [], 'النيجر': [], 'تشاد': [], 'إريتريا': [],
    'مدغشقر': [], 'زيمبابوي': [], 'رواندا': [], 'الكونغو': [], 'ساحل العاج': [], 'أنغولا': [], 'زامبيا': [],
}
# Letters with several well-known countries (counting names that start with "ال" by their next letter).
COUNTRY_LETTERS = list('ابتسفكمنه')

# ------------------------------------------------------------------ start-and-end letters
# Curated everyday words for each pair (Kuwaiti / Gulf words marked in comments). Every pair has many.

PAIRS = {
    ('م', 'ر'): ['مطر', 'ممر', 'منبر', 'مسمار', 'منظر', 'مدير', 'مصدر', 'مختبر', 'منشار', 'مزمار', 'مسار', 'مشوار', 'مؤشر', 'معبر', 'مزار', 'مسطر'],
    ('ب', 'ت'): ['بيت', 'بنت', 'بسكوت', 'بخت', 'بنات', 'بيوت', 'بلوت', 'بهارات', 'بطانيات', 'بوت'],          # بلوت: the card game
    ('ك', 'ب'): ['كتاب', 'كلب', 'كوكب', 'كوب', 'كذب', 'كباب', 'كعب', 'كاتب', 'كسب', 'كواكب', 'كتب'],
    ('س', 'ر'): ['سرير', 'سفر', 'سكر', 'سحر', 'سور', 'سطر', 'سفير', 'سمسار', 'سهر', 'سمر', 'سيجار', 'ستار'],
    ('ق', 'ر'): ['قمر', 'قطار', 'قصر', 'قدر', 'قرار', 'قبر', 'قشر', 'قطر', 'قنطار', 'قدور'],
    ('ب', 'ر'): ['بحر', 'بقر', 'بئر', 'بخور', 'بذر', 'بندر', 'بصر', 'بشر', 'بكر', 'بيدر', 'بنور', 'بهار'],
    ('ش', 'ر'): ['شعر', 'شهر', 'شجر', 'شكر', 'شاعر', 'شاطر', 'شرر'],
    ('ج', 'ل'): ['جبل', 'جمل', 'جميل', 'جدول', 'جوال', 'جيل', 'جدل', 'جلال', 'جبال', 'جمال'],
    ('ح', 'ب'): ['حليب', 'حطب', 'حبيب', 'حساب', 'حجاب', 'حزب', 'حلب', 'حب', 'حروب', 'حبوب'],
    ('ع', 'ن'): ['عين', 'عجين', 'عنوان', 'عيون', 'عطشان', 'عريان', 'عرين', 'عدن', 'عربون', 'عجلان'],
    ('ط', 'ر'): ['طير', 'طيار', 'طابور', 'طائر', 'طور', 'طبشور', 'طهر', 'طيور', 'طرطور'],    # طبشور: chalk (Gulf)
    ('ف', 'ر'): ['فجر', 'فطور', 'فأر', 'فخر', 'فقر', 'فكر', 'فنار', 'فخار', 'فوار', 'فتور'],
    ('ن', 'ر'): ['نار', 'نهر', 'نمر', 'نور', 'نسر', 'نجار', 'نظر', 'نذر', 'نهار', 'نشر'],
    ('ص', 'ر'): ['صقر', 'صدر', 'صبر', 'صخر', 'صفر', 'صغير', 'صور', 'صرصور', 'صفار', 'صهر'],
    ('ر', 'ل'): ['رجل', 'رمل', 'رسول', 'رحيل', 'ريال', 'رسل', 'رجال', 'رطل', 'ركل'],
    ('د', 'ر'): ['دار', 'دور', 'دفتر', 'دكتور', 'دولار', 'دينار', 'دهر', 'دوار', 'دستور', 'ديار'],
    ('م', 'ل'): ['منزل', 'مثل', 'مثال', 'مقال', 'مجال', 'مسلسل', 'مستقبل', 'معمل', 'مندل', 'موال', 'ملل'],
    ('ج', 'ر'): ['جسر', 'جزر', 'جار', 'جدار', 'جوهر', 'جبر', 'جرجير', 'جحر', 'جزار', 'جمر'],
    ('ح', 'ر'): ['حجر', 'حمار', 'حبر', 'حصير', 'حوار', 'حار', 'حذر', 'حرير', 'حضر', 'حفر'],
    ('م', 'ن'): ['مكان', 'ميزان', 'ميدان', 'ممكن', 'مسكين', 'معدن', 'مؤمن', 'مدن', 'متين', 'مخزن', 'محزن'],
    ('ب', 'ل'): ['بطل', 'بصل', 'بلبل', 'برتقال', 'بغل', 'بال', 'بخيل', 'بلال', 'بترول', 'برميل'],
    ('ش', 'ب'): ['شباب', 'شراب', 'شعب', 'شنب', 'شهاب', 'شاب', 'شبشب', 'شغب', 'شرب'],              # شنب: moustache (Gulf)
    ('ق', 'م'): ['قلم', 'قدم', 'قسم', 'قوم', 'قيم', 'قمم', 'قاسم', 'قائم'],
    ('ع', 'ل'): ['عسل', 'عقل', 'عمل', 'عامل', 'عجل', 'عدل', 'عيال', 'عقال', 'عمال'],                # عيال، عقال: Gulf
    ('س', 'ك'): ['سمك', 'سلك', 'سواك', 'سماك'],
    ('ت', 'ب'): ['تراب', 'تعب', 'ترتيب', 'تدريب', 'تقريب', 'تجارب', 'تأديب'],
    ('ك', 'ر'): ['كبير', 'كثير', 'كسر', 'كوثر', 'كاسر', 'كنتور'],                              # كنتور: wardrobe (Kuwaiti)
    ('ف', 'ن'): ['فنجان', 'فستان', 'فرن', 'فلان', 'فنون', 'فتان', 'فطن'],
    ('ز', 'ر'): ['زهر', 'زير', 'زوار', 'زائر', 'زمار', 'زرزور'],
}
for (_f, _l), _ws in PAIRS.items():
    assert all(norm(w)[0] == _f and norm(w)[-1] == _l for w in _ws), (_f, _l, [w for w in _ws if norm(w)[0] != _f or norm(w)[-1] != _l])
PAIR_LIST = [(f, l) for (f, l), ws in PAIRS.items() if len(ws) >= 4]

# Wider vocabulary (exact matches only): frequent Arabic words from the OpenSubtitles 2018 frequency list
# (hermitdave/FrequencyWords, CC BY-SA 4.0), kept only for the pairs above and 3+ letters.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clock_race_words_ar.txt'), encoding='utf-8') as _f:
    FREQUENT = frozenset(w.strip() for w in _f if w.strip())


# ------------------------------------------------------------------ indexes

def _index(entries):
    """{loose normalised spelling (with and without "ال"): (display name, initial letter, spelling)}.
    Only a written plain "ال" is the article (الكويت -> ك); ألمانيا keeps its alef (-> ا)."""
    out = {}
    for name, aliases in entries.items():
        for spelling in [name] + aliases:
            n = norm(spelling)
            bare = n[2:] if spelling.strip().startswith('ال') else n
            for form in (n, bare, 'ال' + bare):
                out.setdefault(loose(form), (name, bare[0], spelling))
    return out


FRUIT_INDEX = _index(FRUITS)
COUNTRY_INDEX = _index(COUNTRIES)
PAIR_CURATED = {pair: {norm(w): w for w in ws} for pair, ws in PAIRS.items()}


def candidates(task):
    """Every accepted answer for an Arabic Word Rush task: {normalised: display}."""
    if task['variant'] == 'pair':
        first, last = task['first'], task['last']
        out = {w: w for w in FREQUENT if w[0] == first and w[-1] == last}
        out.update(PAIR_CURATED.get((first, last), {}))
        return out
    index = COUNTRY_INDEX if task['variant'] == 'country' else FRUIT_INDEX
    return {form: spelling for form, (name, initial, spelling) in index.items() if initial == task['letter']}


def check(task, text):
    """(accepted, display answer or None) for an Arabic Word Rush answer."""
    typed = norm(text)
    if len(typed) < 2:
        return False, None
    if task['variant'] == 'pair':
        first, last = task['first'], task['last']
        if typed[0] != first or typed[-1] != last:          # the asked letters are never forgiven
            return False, None
        curated = PAIR_CURATED.get((first, last), {})
        if typed in curated:
            return True, curated[typed]
        if len(typed) >= 3 and typed in FREQUENT:
            return True, typed
        near = sorted({w for k, w in curated.items() if interior_slip(typed, k)})
        # one slip between the asked letters; if it is close to two words, both fit, so it counts
        return (True, near[0]) if near else (False, None)
    index = COUNTRY_INDEX if task['variant'] == 'country' else FRUIT_INDEX
    letter = task['letter']
    typed = loose(typed)
    hit = index.get(typed)
    if hit:
        return (True, hit[0]) if hit[1] == letter else (False, None)
    # one slip in the middle; the typed word (after "ال") must still start with the asked letter
    tries = [t for t in (typed, typed[2:] if typed.startswith('ال') and len(typed) > 3 else '') if t and t[0] == letter]
    near = {name for form, (name, initial, _) in index.items() if initial == letter and not form.startswith('ال')
            for t in tries if interior_slip(t, form)}
    return (True, near.pop()) if len(near) == 1 else (False, None)
