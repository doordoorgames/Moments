import React, {memo} from 'react';

// Cel-shaded sunset over a crowded rooftop: hard colour bands instead of a smooth
// gradient, water tanks, antennas, cables and party bulbs. Pure decoration.
const BULBS = Array.from({length: 13}, (_, i) => {
  const x = -10 + i * 35;
  const u = i / 12;
  return [x, 84 + 40 * u + 46 * Math.sin(Math.PI * u)];
});
const FAR = [[0, 610, 34], [30, 585, 28], [56, 628, 40], [92, 598, 22], [112, 572, 30], [140, 616, 44], [182, 590, 26],
  [206, 560, 34], [238, 604, 30], [266, 582, 40], [304, 620, 26], [328, 596, 38], [364, 574, 40]];
const MID = [[-6, 668, 60], [52, 640, 46], [96, 690, 52], [146, 652, 40], [184, 676, 58], [240, 636, 44], [282, 664, 52], [332, 646, 74]];

function Skyline() {
  return <div className="tm-sky" aria-hidden="true">
    <svg viewBox="0 0 400 860" preserveAspectRatio="xMidYMax slice">
      <rect width="400" height="860" fill="#2a1438"/>
      <rect y="250" width="400" height="140" fill="#4d1f4a"/>
      <rect y="390" width="400" height="90" fill="#8c3360"/>
      <rect y="480" width="400" height="70" fill="#d24f74"/>
      <rect y="550" width="400" height="52" fill="#f6705a"/>
      <rect y="602" width="400" height="40" fill="#ff9e68"/>
      <rect y="642" width="400" height="60" fill="#ffc98a"/>
      {/* anime streak clouds */}
      <g fill="#ff9cb3" opacity=".45"><path d="M-20 432h190l-26 10H-20Z"/><path d="M210 412h210v9H186Z"/><path d="M40 516h240l-18 8H58Z"/></g>
      <g fill="#ffd9a8" opacity=".5"><path d="M240 566h170v7H226Z"/><path d="M-10 586h120l-10 6H-10Z"/></g>
      <g fill="#ffe9c6">{[[38, 60], [120, 34], [212, 72], [290, 28], [360, 64], [76, 150], [330, 170], [170, 200]].map(([x, y], i) => <rect key={i} x={x} y={y} width="2" height="2"/>)}</g>
      {/* sun with a hard halo */}
      <circle cx="292" cy="640" r="120" fill="#ffd79a" opacity=".35"/>
      <circle cx="292" cy="640" r="86" fill="#ffeab8"/>
      {/* far city */}
      <g fill="#a03f62">{FAR.map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={860 - y}/>)}</g>
      <g fill="#7b2b55">{MID.map(([x, y, w], i) => <rect key={i} x={x} y={y} width={w} height={860 - y}/>)}</g>
      <g fill="#ffc45e" opacity=".75">{MID.flatMap(([x, y, w], i) => Array.from({length: 3}, (_, k) =>
        <rect key={`${i}-${k}`} x={x + 8 + (k % 2) * (w / 2 - 4)} y={y + 14 + k * 22} width="6" height="9"/>))}</g>
      {/* cables */}
      <g fill="none" stroke="#1c1027" strokeWidth="2"><path d="M-10 300Q200 380 410 290"/><path d="M-10 330Q160 420 410 360"/></g>
      {/* party bulbs */}
      <path d={`M${BULBS.map(([x, y]) => `${x} ${y}`).join(' L')}`} fill="none" stroke="#1c1027" strokeWidth="2.5"/>
      {BULBS.map(([x, y], i) => <g key={i} className="tm-bulb" style={{animationDelay: `${(i * 0.37) % 3}s`}}>
        <circle cx={x} cy={y + 9} r="12" fill="#ffd23f" opacity=".22"/>
        <rect x={x - 2} y={y} width="4" height="4" fill="#1c1027"/>
        <circle cx={x} cy={y + 9} r="5" fill="#ffe28a"/>
      </g>)}
      {/* the rooftop */}
      <g fill="#1c1027">
        <path d="M0 770h400v90H0Z"/>
        <path d="M0 752h400v20H0Z"/>
        {/* water tank */}
        <path d="M28 690h84v52H28Z"/><path d="M24 690l46-26 46 26Z"/>
        <path d="M34 742h6v18h-6ZM100 742h6v18h-6ZM66 742h6v18h-6Z"/>
        {/* antenna mast */}
        <path d="M352 560h4v200h-4Z"/><path d="M336 590h36v3h-36ZM340 616h28v3h-28ZM344 640h20v3h-20Z"/>
        <path d="M356 560l18-22 2 2-18 22Z"/>
        {/* dish */}
        <path d="M268 726a26 26 0 0 1 40-20l-30 30Z"/><path d="M286 726h4v28h-4Z"/>
        {/* AC boxes */}
        <path d="M150 724h44v30h-44ZM202 732h34v22h-34Z"/>
      </g>
      <g fill="#3b1d40"><path d="M32 696h6v42h-6Z"/><path d="M154 728h4v22h-4Z"/><path d="M0 752h400v3H0Z"/></g>
      <g fill="#f6705a" opacity=".55"><path d="M108 694h3v44h-3Z"/><path d="M190 726h3v26h-3Z"/></g>
    </svg>
  </div>;
}

export default memo(Skyline);
