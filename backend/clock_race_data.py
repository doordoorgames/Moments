"""Clock Race content: Arabic alphabet, friend questions, faces, and the English answer sets.

Everything a round can ask is curated here so the generator never invents an unfair task.
"""
import os

# The Arabic alphabet in its usual order (28 letters).
ALPHABET = list('ابتثجحخدذرزسشصضطظعغفقكلمنهوي')
# Letters that may go missing or be swapped: never the first three (ا ب ت) or the last two (و ي).
EDITABLE = list(range(3, len(ALPHABET) - 2))  # 23 positions

# سؤال الربع: everyone gets the same question; every name tag is a right answer.
QUESTIONS = [
    'منو أحلى واحد لابس اليوم؟',
    'منو عيونه أحلى شي بالقعدة؟',
    'منو أكثر واحد كشخة اليوم؟',
    'منو لو يصير مشهور ما راح يرد علينا؟',
    'منو أكثر واحد يحتاج إجازة؟',
    'منو لو يدخل برنامج واقع بيصير نجم؟',
    'منو أكثر واحد ممكن يضيع بالمطار؟',
    'منو لو يفوز بمليون أول شي يختفي؟',
    'منو أكثر واحد عنده ذوق بالألوان؟',
    'منو أكثر واحد يستاهل تاج اليوم؟',
    'منو أكثر واحد ممكن يتأخر على عرسه؟',
    'منو أكثر واحد يعرف يسوي دراما من ولا شي؟',
    'منو أكثر واحد عنده ابتسامة حلوة؟',
    'منو أكثر واحد لو يصير مدير بيطردنا كلنا؟',
    'منو أكثر واحد ممكن يصير مؤثر مشهور؟',
]

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
