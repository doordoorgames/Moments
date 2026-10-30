import React from 'react';

// City landmarks, drawn here in the game's flat black-outline style (viewBox 100x100).
const K = '#0B0B0B';
const S = {stroke: K, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round'};
const ground = <path d="M6 90 H94" stroke={K} strokeWidth="4" strokeLinecap="round"/>;

const DRAW = {
  paris: <g>
    <path d="M50 6 L53 28 L59 54 L73 89 H61 C59 79 55 73 50 73 C45 73 41 79 39 89 H27 L41 54 L47 28 Z" fill="#8C6A43" {...S}/>
    <path d="M44 41 H56 M40 56 H60 M36 66 H64" {...S} fill="none"/>
    <path d="M47 28 H53" {...S}/>
  </g>,
  london: <g>
    <path d="M40 88 V34 H60 V88 Z" fill="#D7A65A" {...S}/>
    <path d="M42 34 L50 12 L58 34 Z" fill="#6E5A3A" {...S}/>
    <circle cx="50" cy="44" r="7" fill="#FFFDF7" {...S}/>
    <path d="M50 44 V39.5 M50 44 L53 45.5" stroke={K} strokeWidth="2" strokeLinecap="round"/>
    <path d="M44 58 H56 M44 68 H56 M44 78 H56" {...S}/>
    <path d="M28 88 V62 H40 M60 62 H72 V88" fill="#E8C98E" {...S}/>
  </g>,
  newyork: <g>
    <path d="M36 89 V70 H64 V89 Z" fill="#9C8F7A" {...S}/>
    <path d="M42 70 L44 46 C44 40 47 36 50 36 C53 36 56 40 56 46 L58 70 Z" fill="#62B8A2" {...S}/>
    <path d="M56 44 L63 22" stroke={K} strokeWidth="6" strokeLinecap="round"/>
    <path d="M56 44 L63 22" stroke="#62B8A2" strokeWidth="2.5" strokeLinecap="round"/>
    <path d="M60 22 L66 22 L64 12 Q63 9 63 12 Z" fill="#FFC93C" {...S}/>
    <circle cx="50" cy="31" r="5" fill="#62B8A2" {...S}/>
    <path d="M44 27 L41 22 M47 25 L46 19 M50 25 V18 M53 25 L54 19 M56 27 L59 22" {...S}/>
    <path d="M44 56 L38 60" {...S}/>
  </g>,
  dubai: <g>
    <path d="M38 89 V62 H43 V44 H46 V28 H48.5 V12 L50 4 L51.5 12 V28 H54 V44 H57 V62 H62 V89 Z" fill="#B8C7D6" {...S}/>
    <path d="M43 62 H57 M46 44 H54 M48.5 28 H51.5" {...S}/>
    <path d="M50 30 V86" stroke={K} strokeWidth="1.6" opacity=".45"/>
  </g>,
  cairo: <g>
    <path d="M10 89 L42 34 L74 89 Z" fill="#F2C063" {...S}/>
    <path d="M42 34 L50 89" stroke={K} strokeWidth="2" opacity=".5"/>
    <path d="M56 89 L74 58 L92 89 Z" fill="#E6A845" {...S}/>
    <circle cx="80" cy="20" r="8" fill="#FFC93C" {...S}/>
  </g>,
  sydney: <g>
    <path d="M10 89 H90 V80 H10 Z" fill="#C9B79C" {...S}/>
    <path d="M18 80 C20 62 30 50 44 46 C38 58 37 70 40 80 Z" fill="#FFFDF7" {...S}/>
    <path d="M36 80 C38 58 50 42 66 38 C58 52 56 66 58 80 Z" fill="#FFFDF7" {...S}/>
    <path d="M56 80 C58 64 68 54 82 52 C76 62 74 72 76 80 Z" fill="#FFFDF7" {...S}/>
    <path d="M40 80 C42 70 46 62 52 58 M58 80 C60 72 64 66 70 63" stroke={K} strokeWidth="1.8" fill="none" opacity=".5"/>
  </g>,
  rome: <g>
    <path d="M8 89 V44 Q50 34 92 50 V89 Z" fill="#D9A877" {...S}/>
    <path d="M70 46 Q82 48 92 50 V89 H76 Z" fill="#C58F5E" {...S}/>
    <path d="M8 58 Q50 49 92 62 M8 74 Q50 66 92 76" {...S} fill="none"/>
    {[14, 26, 38, 50, 62].map(x => <g key={x} fill={K}><path d={`M${x} 56 v-6 a3 3 0 0 1 6 0 v6 Z`}/><path d={`M${x} 72 v-6 a3 3 0 0 1 6 0 v6 Z`}/><path d={`M${x} 88 v-7 a3 3 0 0 1 6 0 v7 Z`}/></g>)}
  </g>,
  sanfrancisco: <g>
    <path d="M4 76 H96" stroke={K} strokeWidth="5" strokeLinecap="round"/>
    <path d="M4 76 H96" stroke="#D9472B" strokeWidth="2"/>
    <path d="M4 40 Q16 70 28 74 M28 22 Q50 70 72 22 M72 22 Q84 70 96 40" stroke="#D9472B" strokeWidth="3" fill="none"/>
    <path d="M28 89 V18 M72 89 V18" stroke={K} strokeWidth="9" strokeLinecap="square"/>
    <path d="M28 89 V18 M72 89 V18" stroke="#E8582F" strokeWidth="5" strokeLinecap="square"/>
    <path d="M24 34 H32 M24 52 H32 M68 34 H76 M68 52 H76" {...S}/>
    <path d="M40 76 V58 M50 76 V60 M60 76 V58 M16 76 V64 M84 76 V64" stroke={K} strokeWidth="1.5"/>
  </g>,
  kuwaitcity: <g>
    <path d="M44 89 V8" stroke={K} strokeWidth="5" strokeLinecap="round"/>
    <circle cx="44" cy="52" r="14" fill="#2F7FB8" {...S}/>
    <path d="M30.5 52 H57.5 M33 45 H55 M33 59 H55" stroke="#9CD0F0" strokeWidth="1.6"/>
    <circle cx="44" cy="25" r="8" fill="#2F7FB8" {...S}/>
    <path d="M66 89 V30" stroke={K} strokeWidth="4.5" strokeLinecap="round"/>
    <circle cx="66" cy="44" r="9" fill="#2F7FB8" {...S}/>
    <path d="M57.5 44 H74.5" stroke="#9CD0F0" strokeWidth="1.6"/>
    <path d="M80 89 V52" stroke={K} strokeWidth="3.5" strokeLinecap="round"/>
  </g>,
  pisa: <g transform="rotate(8 50 89)">
    <path d="M38 89 V20 H62 V89 Z" fill="#F4EBDA" {...S}/>
    <path d="M41 20 V12 H59 V20" fill="#F4EBDA" {...S}/>
    {[30, 42, 54, 66, 78].map(y => <path key={y} d={`M38 ${y} H62`} {...S}/>)}
    {[24, 36, 48, 60, 72].map(y => [42, 48, 54].map(x => <path key={`${x}-${y}`} d={`M${x} ${y + 4} v-2.5 a2 2 0 0 1 4 0 v2.5`} stroke={K} strokeWidth="1.6" fill="none"/>))}
  </g>,
};

export default function Landmark({id}) {
  return <svg viewBox="0 0 100 100" className="cr-geo-art" aria-hidden="true">{DRAW[id]}{ground}</svg>;
}
