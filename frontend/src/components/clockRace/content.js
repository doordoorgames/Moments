// Names and colours for Stroop and geography. Keys must match backend/clock_race_data.py.

// Inks chosen for strong contrast on the white answer cards.
export const STROOP = {
  red: {ar: 'أحمر', en: 'RED', ink: '#E3262E'},
  blue: {ar: 'أزرق', en: 'BLUE', ink: '#1F4FE0'},
  green: {ar: 'أخضر', en: 'GREEN', ink: '#0F9A4A'},
  orange: {ar: 'برتقالي', en: 'ORANGE', ink: '#EE6A00'},
  purple: {ar: 'بنفسجي', en: 'PURPLE', ink: '#8130D6'},
  black: {ar: 'أسود', en: 'BLACK', ink: '#0B0B0B'},
};

// kind: country / city / continent / state. Every one is drawn as its real map outline (geoShapes.js),
// cities included, all in the same style.
export const GEO = {
  italy: {kind: 'country', ar: 'إيطاليا', en: 'Italy'},
  brazil: {kind: 'country', ar: 'البرازيل', en: 'Brazil'},
  japan: {kind: 'country', ar: 'اليابان', en: 'Japan'},
  egypt: {kind: 'country', ar: 'مصر', en: 'Egypt'},
  india: {kind: 'country', ar: 'الهند', en: 'India'},
  saudi: {kind: 'country', ar: 'السعودية', en: 'Saudi Arabia'},
  uk: {kind: 'country', ar: 'بريطانيا', en: 'United Kingdom'},
  mexico: {kind: 'country', ar: 'المكسيك', en: 'Mexico'},
  chile: {kind: 'country', ar: 'تشيلي', en: 'Chile'},
  france: {kind: 'country', ar: 'فرنسا', en: 'France'},
  paris: {kind: 'city', ar: 'باريس', en: 'Paris'},
  london: {kind: 'city', ar: 'لندن', en: 'London'},
  newyork: {kind: 'city', ar: 'نيويورك', en: 'New York'},
  sanfrancisco: {kind: 'city', ar: 'سان فرانسيسكو', en: 'San Francisco'},
  rome: {kind: 'city', ar: 'روما', en: 'Rome'},
  dubai: {kind: 'city', ar: 'دبي', en: 'Dubai'},
  kuwaitcity: {kind: 'city', ar: 'مدينة الكويت', en: 'Kuwait City'},
  istanbul: {kind: 'city', ar: 'إسطنبول', en: 'Istanbul'},
  tokyo: {kind: 'city', ar: 'طوكيو', en: 'Tokyo'},
  rio: {kind: 'city', ar: 'ريو دي جانيرو', en: 'Rio de Janeiro'},
  africa: {kind: 'continent', ar: 'أفريقيا', en: 'Africa'},
  asia: {kind: 'continent', ar: 'آسيا', en: 'Asia'},
  europe: {kind: 'continent', ar: 'أوروبا', en: 'Europe'},
  north_america: {kind: 'continent', ar: 'أمريكا الشمالية', en: 'North America'},
  south_america: {kind: 'continent', ar: 'أمريكا الجنوبية', en: 'South America'},
  oceania: {kind: 'continent', ar: 'أوقيانوسيا', en: 'Oceania'},
  antarctica: {kind: 'continent', ar: 'القارة القطبية', en: 'Antarctica'},
  texas: {kind: 'state', ar: 'تكساس', en: 'Texas'},
};
