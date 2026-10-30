import React, {memo} from 'react';
import {GEO_SHAPES} from './geoShapes';

// Geography pictures. Countries, continents and Texas are real map outlines (geoShapes.js, built
// from Natural Earth); cities are drawn landmarks. Keys and categories must match GEO in
// backend/clock_race_data.py.
export const GEO_NAMES = {
  italy: {ar: 'إيطاليا', en: 'Italy'},
  japan: {ar: 'اليابان', en: 'Japan'},
  brazil: {ar: 'البرازيل', en: 'Brazil'},
  india: {ar: 'الهند', en: 'India'},
  egypt: {ar: 'مصر', en: 'Egypt'},
  saudi: {ar: 'السعودية', en: 'Saudi Arabia'},
  uk: {ar: 'بريطانيا', en: 'United Kingdom'},
  china: {ar: 'الصين', en: 'China'},
  mexico: {ar: 'المكسيك', en: 'Mexico'},
  canada: {ar: 'كندا', en: 'Canada'},
  paris: {ar: 'باريس', en: 'Paris'},
  london: {ar: 'لندن', en: 'London'},
  new_york: {ar: 'نيويورك', en: 'New York'},
  dubai: {ar: 'دبي', en: 'Dubai'},
  cairo: {ar: 'القاهرة', en: 'Cairo'},
  rome: {ar: 'روما', en: 'Rome'},
  sydney: {ar: 'سيدني', en: 'Sydney'},
  tokyo: {ar: 'طوكيو', en: 'Tokyo'},
  rio: {ar: 'ريو دي جانيرو', en: 'Rio de Janeiro'},
  san_francisco: {ar: 'سان فرانسيسكو', en: 'San Francisco'},
  africa: {ar: 'أفريقيا', en: 'Africa'},
  asia: {ar: 'آسيا', en: 'Asia'},
  europe: {ar: 'أوروبا', en: 'Europe'},
  north_america: {ar: 'أمريكا الشمالية', en: 'North America'},
  south_america: {ar: 'أمريكا الجنوبية', en: 'South America'},
  oceania: {ar: 'أستراليا وأوقيانوسيا', en: 'Oceania'},
  antarctica: {ar: 'القارة القطبية الجنوبية', en: 'Antarctica'},
  texas: {ar: 'تكساس', en: 'Texas'},
};

const INK = '#0B0B0B';
const MAP = '#2E4BFF';
const s = {stroke: INK, strokeWidth: 2.4, strokeLinejoin: 'round', strokeLinecap: 'round'};

// Each landmark sits in a 100x100 box on a ground line at y=88.
const LANDMARKS = {
  paris: <g {...s}>{/* Eiffel Tower */}
    <path d="M50 8 L52 20 L56 44 L61 60 L72 88 L60 88 Q50 70 40 88 L28 88 L39 60 L44 44 L48 20 Z" fill="#9B5B2E"/>
    <path d="M41 44 H59 M36 60 H64" fill="none" strokeWidth="3.2"/>
    <path d="M46 26 L54 38 M54 26 L46 38 M44 48 L56 58 M56 48 L44 58" fill="none" strokeWidth="1.4"/>
    <path d="M50 3 V9" fill="none"/>
  </g>,
  london: <g {...s}>{/* Big Ben */}
    <path d="M50 4 L57 22 H43 Z" fill="#33507A"/>
    <rect x="41" y="22" width="18" height="8" fill="#E8C27A"/>
    <rect x="39" y="30" width="22" height="22" fill="#E8C27A"/>
    <circle cx="50" cy="41" r="8" fill="#FFFDF7"/>
    <path d="M50 41 V36 M50 41 H54" fill="none" strokeWidth="1.8"/>
    <rect x="40" y="52" width="20" height="36" fill="#D9A95A"/>
    <path d="M45 58 V84 M50 58 V84 M55 58 V84" fill="none" strokeWidth="1.4"/>
  </g>,
  new_york: <g {...s}>{/* Statue of Liberty */}
    <path d="M36 88 H64 V74 H36 Z" fill="#B9A27A"/>
    <path d="M41 74 L44 44 Q50 38 56 44 L59 74 Z" fill="#5FB89A"/>
    <circle cx="50" cy="34" r="6" fill="#5FB89A"/>
    <path d="M43 30 L41 24 M47 28 L46 21 M50 28 V20 M53 28 L54 21 M57 30 L59 24" fill="none" strokeWidth="2"/>
    <path d="M56 46 L64 26" fill="none" strokeWidth="5" stroke="#5FB89A"/>
    <path d="M56 46 L64 26" fill="none" strokeWidth="1.2"/>
    <path d="M61 26 H67 L66 21 H62 Z" fill="#5FB89A"/>
    <path d="M64 21 Q60 15 64 9 Q68 15 64 21 Z" fill="#FFC93C"/>
    <rect x="40" y="50" width="7" height="9" fill="#5FB89A" transform="rotate(-12 43 54)"/>
  </g>,
  dubai: <g {...s}>{/* Burj Khalifa */}
    <path d="M50 4 V16" fill="none"/>
    <path d="M48 16 H52 L53 30 H56 L57 46 H60 L61 62 H65 L66 88 H34 L35 62 H39 L40 46 H43 L44 30 H47 Z" fill="#9FC7E8"/>
    <path d="M50 18 V88" fill="none" strokeWidth="1.4"/>
  </g>,
  cairo: <g {...s}>{/* Pyramids of Giza */}
    <circle cx="78" cy="22" r="8" fill="#FFC93C"/>
    <path d="M10 88 L36 50 L62 88 Z" fill="#E3B567"/>
    <path d="M36 50 L44 88" fill="none" strokeWidth="1.4"/>
    <path d="M46 88 L68 54 L90 88 Z" fill="#D9A24E"/>
    <path d="M68 54 L74 88" fill="none" strokeWidth="1.4"/>
    <path d="M30 88 L42 70 L54 88 Z" fill="#EFC67E"/>
  </g>,
  rome: <g {...s}>{/* Colosseum */}
    <path d="M8 88 V44 Q50 30 92 40 V88 Z" fill="#D9A95A"/>
    <path d="M70 37 Q82 38 92 40 V88 H74 V60 Q72 46 70 37 Z" fill="#C08A3E"/>
    <path d="M8 58 Q50 46 92 54 M8 73 Q50 63 92 70" fill="none" strokeWidth="1.8"/>
    {[14, 26, 38, 50, 62, 74, 85].map(x => <g key={x} fill="#5B3A1A" stroke="none">
      <rect x={x - 3} y={x < 70 ? 49 - (x - 8) * .16 : 48} width="6" height="7"/>
      <rect x={x - 3} y={x < 70 ? 63 - (x - 8) * .14 : 61} width="6" height="8"/>
      <rect x={x - 3} y={78} width="6" height="10"/>
    </g>)}
  </g>,
  sydney: <g {...s}>{/* Sydney Opera House */}
    <path d="M6 88 H94" fill="none"/>
    <path d="M10 78 H90 V88 H10 Z" fill="#E3B567"/>
    <path d="M16 78 Q22 48 40 40 Q34 60 36 78 Z" fill="#FFFDF7"/>
    <path d="M32 78 Q40 40 62 30 Q52 56 54 78 Z" fill="#FFFDF7"/>
    <path d="M52 78 Q60 50 80 44 Q72 62 74 78 Z" fill="#FFFDF7"/>
    <path d="M70 78 Q76 62 88 58 Q84 68 86 78 Z" fill="#FFFDF7"/>
  </g>,
  tokyo: <g {...s}>{/* Tokyo Tower */}
    <path d="M50 4 V14" fill="none"/>
    <path d="M47 14 H53 L56 34 H44 Z" fill="#FF5B36"/>
    <rect x="42" y="34" width="16" height="6" fill="#FFFDF7"/>
    <path d="M44 40 H56 L62 60 H38 Z" fill="#FF5B36"/>
    <rect x="35" y="60" width="30" height="6" fill="#FFFDF7"/>
    <path d="M37 66 H63 L74 88 H62 Q50 74 38 88 H26 Z" fill="#FF5B36"/>
    <path d="M46 46 L54 56 M54 46 L46 56" fill="none" strokeWidth="1.3"/>
  </g>,
  rio: <g {...s}>{/* Christ the Redeemer on Corcovado */}
    <path d="M4 88 Q30 52 50 50 Q72 52 96 88 Z" fill="#4E9A52"/>
    <rect x="46" y="44" width="8" height="8" fill="#D8D2C4"/>
    <path d="M47 44 L45 22 H55 L53 44 Z" fill="#EDE8DC"/>
    <path d="M20 24 H80 V29 H20 Z" fill="#EDE8DC"/>
    <circle cx="50" cy="17" r="5" fill="#EDE8DC"/>
  </g>,
  san_francisco: <g {...s}>{/* Golden Gate Bridge */}
    <path d="M0 88 H100" fill="none"/>
    <path d="M4 26 Q16 64 30 66 M30 26 Q50 70 70 26 M70 66 Q84 64 96 26" fill="none" stroke="#C0272D" strokeWidth="2"/>
    <path d="M2 66 H98 V71 H2 Z" fill="#E0482F"/>
    <path d="M25 14 H35 V88 H25 Z M65 14 H75 V88 H65 Z" fill="#E0482F"/>
    <path d="M25 30 H35 M25 46 H35 M65 30 H75 M65 46 H75" fill="none" strokeWidth="1.8"/>
    <path d="M38 76 Q50 72 62 76" fill="none" stroke="#2E4BFF" strokeWidth="1.6"/>
  </g>,
};

function GeoPic({id}) {
  if (LANDMARKS[id]) return <svg viewBox="0 0 100 92" className="cr-geo-pic" aria-hidden="true">{LANDMARKS[id]}</svg>;
  const d = GEO_SHAPES[id];
  if (!d) return null;
  // Outline drawn first and the fill on top, so borders inside a continent disappear.
  return <svg viewBox="0 0 100 100" className="cr-geo-pic is-map" aria-hidden="true">
    <path d={d} fill="none" stroke={INK} strokeWidth="3.4" strokeLinejoin="round" transform="translate(1.2 1.6)"/>
    <path d={d} fill="none" stroke={INK} strokeWidth="3.4" strokeLinejoin="round"/>
    <path d={d} fill={MAP} stroke={MAP} strokeWidth=".6" strokeLinejoin="round"/>
  </svg>;
}

export default memo(GeoPic);
