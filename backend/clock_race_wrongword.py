"""Clock Race · Tap the incorrect word (اضغط على الكلمة الخطأ).

A sentence with exactly one wrong word (grammar, spelling, context or meaning); the player taps it.

A question is {lang, text, wrong, word}:
    lang   'ar' or 'en' (the room's language decides which questions it gets)
    text   the sentence, words split on spaces; punctuation stays attached to its word
    wrong  the index of the wrong word in text.split() -- an index, never the word itself, so a word
           that appears twice ("would ... would") can't confuse the answer key
    word   that word's text, saved alongside: if the sentence is edited so the index points at another
           word, validation stops the question until the wrong word is picked again

The correct answer is always picked by hand (in this file or in the studio); nothing works it out.
"""
from __future__ import annotations

import re

ARABIC = re.compile(r'[؀-ۿ]')
MIN_WORDS = 3
MAX_WORDS = 28   # ~4 words a line, at most ~7 lines on a phone
MAX_TEXT = 220

# (id, lang, text, index of the wrong word). Each has exactly one wrong word, and no other single-word
# change would also make the sentence right (checked by hand for every line).
BUILTIN = [
    # ---------------------------------------------------------------- English
    ('ww_en01', 'en', 'She has lived in Kuwait since five years and loves the winter.', 5),          # since -> for
    ('ww_en02', 'en', 'Every morning the sun rises in the west and fills the sky with light.', 7),   # west -> east
    ('ww_en03', 'en', 'My brother and me went to the cinema last night.', 3),                        # me -> I
    ('ww_en04', 'en', 'Fish use their lungs to take oxygen from the water around them.', 3),         # lungs -> gills
    ('ww_en05', 'en', 'Please turn of the lights before you leave the room.', 2),                    # of -> off
    ('ww_en06', 'en', 'If I would have known, I would have called you earlier.', 2),                 # first would -> had
    ('ww_en07', 'en', 'Water freezes at fifty degrees Celsius and boils at one hundred.', 3),        # fifty -> zero
    ('ww_en08', 'en', 'Their is a small cat sleeping on the warm car roof.', 0),                     # Their -> There
    ('ww_en09', 'en', 'We were all very exciting about the trip to London next week.', 4),           # exciting -> excited
    ('ww_en10', 'en', 'A triangle has four sides and three corners.', 3),                            # four -> three
    ('ww_en11', 'en', 'He runs faster then anyone else in his class.', 3),                           # then -> than
    ('ww_en12', 'en', 'Giraffes use their very long necks to reach leaves high up in the rivers.', 13),  # rivers -> trees
    ('ww_en13', 'en', 'Both children was playing football in the park after school.', 2),            # was -> were
    ('ww_en14', 'en', 'Bees make honey from the milk of flowers.', 5),                               # milk -> nectar
    ('ww_en15', 'en', 'Yesterday I go to the market and bought fresh bread.', 2),                    # go -> went
    # ---------------------------------------------------------------- Arabic
    ('ww_ar01', 'ar', 'ذهبت إلى المكتبة لأشتري خبزا طازجا للفطور', 2),                    # المكتبة -> المخبز
    ('ww_ar02', 'ar', 'يتنفس السمك تحت الماء بواسطة الرئتين', 5),                          # الرئتين -> الخياشيم
    ('ww_ar03', 'ar', 'الطالبان مجتهدون في دراستهما', 1),                                 # مجتهدون -> مجتهدان
    ('ww_ar04', 'ar', 'في الأسبوع ثمانية أيام تبدأ عندنا بيوم الأحد', 2),                  # ثمانية -> سبعة
    ('ww_ar05', 'ar', 'ذهبت إلى السوق وإشتريت فاكهة طازجة', 3),                           # وإشتريت -> واشتريت
    ('ww_ar06', 'ar', 'رأيت قطة صغير تلعب بالكرة في الحديقة', 2),                          # صغير -> صغيرة
    ('ww_ar07', 'ar', 'النحل يصنع العسل من رحيق الحجارة', 5),                             # الحجارة -> الأزهار
    ('ww_ar08', 'ar', 'يحتاج النبات إلى الماء والظلام ليصنع غذاءه', 4),                    # والظلام -> والضوء
    ('ww_ar09', 'ar', 'هذا الكتاب الذي اشتريته أمس، وهذه الحقيبة الذي اشتريتها اليوم', 7),   # the second الذي -> التي
    ('ww_ar10', 'ar', 'استيقظت مبكرا ونمت إلى المدرسة قبل الجميع', 2),                     # ونمت -> وذهبت
    ('ww_ar11', 'ar', 'المعلمات يشرحن الدرس للطالبات بكل صبر وهم سعيدات', 6),              # وهم -> وهن
    ('ww_ar12', 'ar', 'يستخدم الطبيب المقص ليسمع دقات قلب المريض', 2),                     # المقص -> السماعة
    ('ww_ar13', 'ar', 'تسكن الأسماك في الصحراء وتسبح بين الأمواج', 3),                     # الصحراء -> البحر
    ('ww_ar14', 'ar', 'في الفصل خمسة طالبات متفوقات', 2),                                 # خمسة -> خمس
    ('ww_ar15', 'ar', 'عاصمة دولة الكويت هي مدينة الكويت، وعملتها الريال', 7),             # الريال -> الدينار
]


def words(text):
    """The words of a sentence, exactly as the player sees them (split on spaces, punctuation kept)."""
    return str(text or '').split()


def builtin():
    """{id: data} for the hand-made questions."""
    out = {}
    for qid, lang, text, wrong in BUILTIN:
        out[qid] = dict(lang=lang, text=text, wrong=wrong, word=words(text)[wrong])
    return out


def normalize(data):
    text = ' '.join(str(data.get('text') or '').split())[:MAX_TEXT]
    lang = data.get('lang') if data.get('lang') in ('ar', 'en') else ('ar' if ARABIC.search(text) else 'en')
    toks = words(text)
    try:
        wrong = int(data.get('wrong'))
    except (TypeError, ValueError):
        wrong = None
    if wrong is not None and not 0 <= wrong < len(toks):
        wrong = None
    word = str(data.get('word') or '').strip()[:60]
    if wrong is not None and not word:
        word = toks[wrong]
    return dict(lang=lang, text=text, wrong=wrong, word=word or None)


def validate(d):
    """[(level, message)]: errors block approval."""
    out = []
    toks = words(d.get('text'))
    if not toks:
        return [('error', 'Write the sentence')]
    if len(toks) < MIN_WORDS:
        out.append(('error', f'Needs at least {MIN_WORDS} words'))
    if len(toks) > MAX_WORDS:
        out.append(('error', f'Too long for a phone: {len(toks)} words (at most {MAX_WORDS})'))
    lang = d.get('lang')
    if lang == 'ar' and not ARABIC.search(d.get('text') or ''):
        out.append(('error', 'Arabic question has no Arabic letters'))
    if lang == 'en' and ARABIC.search(d.get('text') or ''):
        out.append(('error', 'English question contains Arabic letters'))
    w = d.get('wrong')
    if w is None:
        out.append(('error', 'Pick the incorrect word'))
    elif not isinstance(w, int) or not 0 <= w < len(toks):
        out.append(('error', 'The incorrect word is outside the sentence; pick it again'))
    elif d.get('word') and toks[w] != d['word']:
        out.append(('error', f'The sentence changed: word {w + 1} is now "{toks[w]}", not "{d["word"]}". Pick the incorrect word again'))
    if any(len(t) > 18 for t in toks):
        out.append(('warn', 'A very long word may not fit one line on small phones'))
    return out


def task(qid, d):
    """The task the game sends: the words and the index of the wrong one."""
    return dict(type='wrongword', qid=qid, lang=d['lang'], words=words(d['text']), answer=d['wrong'])
