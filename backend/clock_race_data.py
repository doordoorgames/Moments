"""Clock Race content: friend questions, faces, geography, socks, memory and the English answer sets.

Everything a round can ask is curated here so the generator never invents an unfair task.
"""
import os

LANGS = ('ar', 'en')

# سؤال الربع: everyone gets the same question; every name tag is a right answer. (Arabic, English)
QUESTIONS = [
    ('منو أحلى واحد لابس اليوم؟', 'Who is dressed best today?'),
    ('منو عيونه أحلى شي بالقعدة؟', 'Who has the prettiest eyes here?'),
    ('منو أكثر واحد كشخة اليوم؟', 'Who looks the sharpest today?'),
    ('منو لو يصير مشهور ما راح يرد علينا؟', 'Who would ignore us all if they got famous?'),
    ('منو أكثر واحد يحتاج إجازة؟', 'Who needs a holiday the most?'),
    ('منو لو يدخل برنامج واقع بيصير نجم؟', 'Who would be the star of a reality show?'),
    ('منو أكثر واحد ممكن يضيع بالمطار؟', 'Who is most likely to get lost at the airport?'),
    ('منو لو يفوز بمليون أول شي يختفي؟', 'Who would vanish first after winning a million?'),
    ('منو أكثر واحد عنده ذوق بالألوان؟', 'Who has the best taste in colours?'),
    ('منو أكثر واحد يستاهل تاج اليوم؟', 'Who deserves a crown today?'),
    ('منو أكثر واحد ممكن يتأخر على عرسه؟', 'Who would be late to their own wedding?'),
    ('منو أكثر واحد يعرف يسوي دراما من ولا شي؟', 'Who can make drama out of nothing?'),
    ('منو أكثر واحد عنده ابتسامة حلوة؟', 'Who has the sweetest smile?'),
    ('منو أكثر واحد لو يصير مدير بيطردنا كلنا؟', 'Who would fire all of us if they became the boss?'),
    ('منو أكثر واحد ممكن يصير مؤثر مشهور؟', 'Who is most likely to become a famous influencer?'),
]

# Stroop: colour keys. Names and ink values live in frontend clockRace/content.js (STROOP).
STROOP_COLORS = ['red', 'blue', 'green', 'orange', 'purple', 'black']

# Geography: key -> category. Names and pictures live in frontend clockRace/content.js (GEO).
# Australia the country is left out on purpose: it would also read as a continent.
GEO = {
    **{k: 'country' for k in ('italy', 'brazil', 'japan', 'egypt', 'india', 'saudi', 'uk', 'mexico', 'chile', 'france')},
    **{k: 'city' for k in ('paris', 'london', 'newyork', 'sanfrancisco', 'rome', 'dubai', 'kuwaitcity', 'istanbul', 'tokyo', 'rio')},
    **{k: 'continent' for k in ('africa', 'asia', 'europe', 'north_america', 'south_america', 'oceania', 'antarctica')},
    'texas': 'state',
}
# A city never sits next to its own country (Paris beside France would be a giveaway pairing).
GEO_SAME_PLACE = {('paris', 'france'), ('london', 'uk'), ('rome', 'italy'), ('tokyo', 'japan')}

# Socks: a design is "color-pattern-accent". Must match SOCK_* in frontend clockRace/Sock.jsx.
SOCK_COLORS = 5     # coral, sky, mint, sun, lilac
SOCK_PATTERNS = 5   # plain, stripes, dots, zigzag, checks
SOCK_ACCENTS = 3    # cream, ink, red (cuff, heel and toe)

# Memory: one 3x3 grid of nine different letters, gently blinking (four blinks) for MEMORY_SHOW
# seconds, then "which letter was there?". Letters that are easy to tell apart at a glance.
MEMORY_SHOW = 4.0
MEMORY_LETTERS = {
    'ar': list('ابجدرسصطعفقكلمنهويحش'),
    'en': list('ABCDEFGHJKLMNPRSTUVY'),
}

# Faces are drawn by the app (never system emoji), so every phone shows exactly the same face.
# A face is "eyes-mouth-color". Must match EYES / MOUTHS / FACE_COLORS in frontend clockRace/Face.jsx.
EYES = 6      # dots, happy arcs, wink, sleepy lines, X, big round
MOUTHS = 6    # smile, frown, open O, flat, big grin, tongue
FACE_COLORS = 4  # sun yellow, pink, mint, sky
SMILE = 'smile'
SAD = 'sad'

# Word Rush, variation 1: approved first/last letter pairs. Each has 20+ everyday answers in
# the familiar-word list (checked by test_clock_race.py). No Q/X/Z anywhere, never ending in U.
LETTER_PAIRS = [
    'BE', 'CE', 'DE', 'FE', 'GE', 'HE', 'LE', 'ME', 'PE', 'RE', 'SE', 'TE', 'WE',
    'BY', 'CY', 'DY', 'FY', 'HY', 'MY', 'PY', 'RY', 'SY', 'TY', 'LY',
    'CT', 'ST', 'PT', 'BT', 'CD', 'SD', 'RD', 'BD', 'PD', 'CN', 'PN', 'CR', 'SR',
]

# Accepted English words: the common-word list from the public-domain ENABLE dictionary
# ("popular" subset), kept only for the approved pairs. Lowercase, letters only, 3+ letters.
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clock_race_words.txt'), encoding='utf-8') as _f:
    WORDS = frozenset(w.strip() for w in _f if w.strip())

# Variation 2: countries. Name -> extra accepted spellings / established short names.
COUNTRIES = {
    'Afghanistan': [], 'Albania': [], 'Algeria': [], 'Argentina': [], 'Armenia': [], 'Australia': [], 'Austria': [],
    'Azerbaijan': [],
    'Bahrain': [], 'Bangladesh': [], 'Belarus': [], 'Belgium': [], 'Bolivia': [], 'Bosnia': ['Bosnia and Herzegovina'],
    'Brazil': ['Brasil'], 'Bulgaria': [], 'Bhutan': [], 'Botswana': [], 'Brunei': [],
    'Cambodia': [], 'Cameroon': [], 'Canada': [], 'Chile': [], 'China': [], 'Colombia': [], 'Costa Rica': [],
    'Croatia': [], 'Cuba': [], 'Cyprus': [], 'Czechia': ['Czech Republic'], 'Chad': [], 'Congo': [],
    'Denmark': [], 'Djibouti': [], 'Dominican Republic': [],
    'Ecuador': [], 'Egypt': [], 'England': [], 'Eritrea': [], 'Estonia': [], 'Ethiopia': [], 'El Salvador': [],
    'Fiji': [], 'Finland': [], 'France': [],
    'Georgia': [], 'Germany': [], 'Ghana': [], 'Greece': [], 'Guatemala': [], 'Guinea': [], 'Greenland': [],
    'Haiti': [], 'Honduras': [], 'Hungary': [], 'Holland': [],
    'Iceland': [], 'India': [], 'Indonesia': [], 'Iran': [], 'Iraq': [], 'Ireland': [], 'Italy': [], 'Ivory Coast': [],
    'Jamaica': [], 'Japan': [], 'Jordan': [],
    'Kazakhstan': [], 'Kenya': [], 'Korea': ['South Korea', 'North Korea'], 'Kuwait': [], 'Kyrgyzstan': [], 'Kosovo': [],
    'Laos': [], 'Latvia': [], 'Lebanon': [], 'Libya': [], 'Lithuania': [], 'Luxembourg': [], 'Liberia': [],
    'Madagascar': [], 'Malaysia': [], 'Maldives': [], 'Mali': [], 'Malta': [], 'Mauritania': [], 'Mexico': [],
    'Moldova': [], 'Monaco': [], 'Mongolia': [], 'Montenegro': [], 'Morocco': [], 'Mozambique': [], 'Myanmar': [],
    'Mauritius': [],
    'Namibia': [], 'Nepal': [], 'Netherlands': [], 'New Zealand': [], 'Nicaragua': [], 'Niger': [], 'Nigeria': [],
    'Norway': [], 'North Macedonia': ['Macedonia'],
    'Oman': [],
    'Pakistan': [], 'Palestine': [], 'Panama': [], 'Paraguay': [], 'Peru': [], 'Philippines': [], 'Poland': [],
    'Portugal': [],
    'Qatar': [],
    'Romania': [], 'Russia': [], 'Rwanda': [],
    'Saudi Arabia': ['Saudi', 'KSA'], 'Scotland': [], 'Senegal': [], 'Serbia': [], 'Singapore': [], 'Slovakia': [],
    'Slovenia': [], 'Somalia': [], 'South Africa': [], 'Spain': [], 'Sri Lanka': [], 'Sudan': [], 'Sweden': [],
    'Switzerland': [], 'Syria': [],
    'Taiwan': [], 'Tajikistan': [], 'Tanzania': [], 'Thailand': [], 'Tunisia': [], 'Turkey': ['Turkiye'],
    'Turkmenistan': [], 'Togo': [],
    'Uganda': [], 'Ukraine': [], 'United Arab Emirates': ['UAE', 'Emirates'], 'United Kingdom': ['UK', 'Britain', 'Great Britain'],
    'United States': ['USA', 'US', 'America', 'United States of America'], 'Uruguay': [], 'Uzbekistan': [],
    'Venezuela': [], 'Vietnam': [],
    'Wales': [],
    'Yemen': [],
    'Zambia': [], 'Zimbabwe': [],
}
# Letters with plenty of countries most people know.
COUNTRY_LETTERS = list('ABCEGIJKLMNPSTU')

# Variation 3: fruits. Name -> accepted variants.
FRUITS = {
    'Apple': [], 'Apricot': [], 'Avocado': [], 'Acai': [],
    'Banana': [], 'Blueberry': [], 'Blackberry': [], 'Blackcurrant': [], 'Boysenberry': [],
    'Cherry': [], 'Coconut': [], 'Cantaloupe': [], 'Clementine': [], 'Cranberry': [], 'Custard Apple': [],
    'Date': ['Dates'], 'Dragon Fruit': ['Dragonfruit'], 'Durian': [],
    'Fig': [],
    'Grape': ['Grapes'], 'Grapefruit': [], 'Guava': [], 'Gooseberry': [], 'Goji Berry': ['Goji'],
    'Honeydew': [],
    'Jackfruit': [],
    'Kiwi': ['Kiwifruit'], 'Kumquat': [],
    'Lemon': [], 'Lime': [], 'Lychee': ['Litchi', 'Lichee'], 'Longan': [], 'Loquat': [],
    'Mango': [], 'Melon': [], 'Mandarin': [], 'Mulberry': [], 'Mangosteen': [],
    'Nectarine': [],
    'Orange': [], 'Olive': [],
    'Peach': [], 'Pear': [], 'Pineapple': [], 'Plum': [], 'Pomegranate': [], 'Papaya': [], 'Passion Fruit': ['Passionfruit'],
    'Persimmon': [], 'Prune': [], 'Pomelo': [],
    'Raspberry': [], 'Raisin': ['Raisins'], 'Rambutan': [], 'Redcurrant': [],
    'Strawberry': [], 'Starfruit': ['Star Fruit'], 'Soursop': [], 'Satsuma': [], 'Sultana': [],
    'Tangerine': [], 'Tomato': [],
    'Watermelon': [],
}
# Letters with several familiar fruits.
FRUIT_LETTERS = list('ABCGLMPS')
