"""Landmark-location photo questions. First country is correct; gen_photo shuffles it.

Photographs, country verification and reuse licenses: photos/landmarks/credits.json.
Rendered through the existing photo challenge to share scoring, lives and preloading.
"""
COUNTRIES = {
    'FR': ['فرنسا', 'France'], 'CN': ['الصين', 'China'],
    'US': ['الولايات المتحدة', 'United States'], 'DE': ['ألمانيا', 'Germany'],
    'BR': ['البرازيل', 'Brazil'], 'IT': ['إيطاليا', 'Italy'],
    'IN': ['الهند', 'India'], 'GB': ['المملكة المتحدة', 'United Kingdom'],
    'AU': ['أستراليا', 'Australia'], 'ES': ['إسبانيا', 'Spain'],
    'AT': ['النمسا', 'Austria'], 'JP': ['اليابان', 'Japan'],
    'KR': ['كوريا الجنوبية', 'South Korea'], 'MN': ['منغوليا', 'Mongolia'],
    'CA': ['كندا', 'Canada'], 'AR': ['الأرجنتين', 'Argentina'],
    'MX': ['المكسيك', 'Mexico'], 'PT': ['البرتغال', 'Portugal'],
    'GR': ['اليونان', 'Greece'], 'TR': ['تركيا', 'Turkey'],
    'PK': ['باكستان', 'Pakistan'], 'BD': ['بنغلاديش', 'Bangladesh'],
    'IR': ['إيران', 'Iran'], 'IE': ['أيرلندا', 'Ireland'],
    'HU': ['المجر', 'Hungary'], 'NZ': ['نيوزيلندا', 'New Zealand'],
    'SG': ['سنغافورة', 'Singapore'],
}

LANDMARKS = [
    ('eiffel', 'FR', 'IT', 'ES', 'AT'),
    ('great_wall', 'CN', 'JP', 'KR', 'MN'),
    ('empire_state', 'US', 'CA', 'AU', 'GB'),
    ('brandenburg', 'DE', 'AT', 'FR', 'GR'),
    ('christ_redeemer', 'BR', 'AR', 'MX', 'PT'),
    ('colosseum', 'IT', 'GR', 'TR', 'ES'),
    ('taj_mahal', 'IN', 'PK', 'BD', 'IR'),
    ('bigben', 'GB', 'IE', 'CA', 'HU'),
    ('pisa', 'IT', 'ES', 'FR', 'PT'),
    ('sydney_opera', 'AU', 'NZ', 'SG', 'CA'),
]

LANDMARK_BANK = [
    dict(id=f'landmark_{key}', landmark=key, pic=f'landmarks/{key}', mode='ask',
         ar='أين يقع هذا المعلم؟', en='Where is this landmark located?',
         options=[COUNTRIES[country][:] for country in countries])
    for key, *countries in LANDMARKS
]
