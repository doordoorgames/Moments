import React, {memo, useMemo} from 'react';

const BULBS = [[-5,111],[90,167],[195,203],[305,222],[417,218],[530,197],[641,166],[755,132],[869,117],[981,121],[1091,137],[1200,160],[1313,183],[1420,196],[160,90],[350,151],[555,187],[765,186],[976,151],[1180,95],[1360,44]];

// Word Trap mood: every bulb breathes at its own random pace, and a few
// random bulbs flicker now and then (rarely, never in sync).
function bulbStyles(trap) {
  if (!trap) return BULBS.map((_,i)=>({animationDelay:`${i*.31}s`}));
  const flicker = new Set();
  while (flicker.size < 4) flicker.add(Math.floor(Math.random()*BULBS.length));
  return BULBS.map((_,i)=>{
    const breathe = `pt-breathe ${(2.6+Math.random()*3.6).toFixed(2)}s ease-in-out ${(-Math.random()*6).toFixed(2)}s infinite alternate`;
    return {animation: flicker.has(i) ? `${breathe}, pt-flicker ${(7+Math.random()*9).toFixed(2)}s steps(1,end) ${(Math.random()*8).toFixed(2)}s infinite` : breathe};
  });
}

function Rooftop({mood}) {
  const trap = mood === 'trap';
  const styles = useMemo(()=>bulbStyles(trap),[trap]);
  return <div className={`pt-world ${trap?'pt-world-trap':''}`} aria-hidden="true"><svg className="pt-scenery" viewBox="0 0 1440 1100" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="pt-sky" x2="0" y2="1"><stop stopColor="#251645"/><stop offset=".35" stopColor="#79467c"/><stop offset=".62" stopColor="#dd7297"/><stop offset=".79" stopColor="#ffbd98"/><stop offset="1" stopColor="#976399"/></linearGradient>
      <linearGradient id="pt-floor" x2="0" y2="1"><stop stopColor="#513447"/><stop offset="1" stopColor="#211b36"/></linearGradient>
      <radialGradient id="pt-sun"><stop stopColor="#ffeac0" stopOpacity=".8"/><stop offset="1" stopColor="#ffd2ba" stopOpacity="0"/></radialGradient>
      <radialGradient id="pt-lamp"><stop stopColor="#fff4be"/><stop offset=".18" stopColor="#ffcc77" stopOpacity=".8"/><stop offset="1" stopColor="#ffbb65" stopOpacity="0"/></radialGradient>
      <pattern id="pt-windows" width="24" height="29" patternUnits="userSpaceOnUse"><rect width="6" height="12" x="8" y="8" fill="#ffc9ae" opacity=".42"/></pattern>
      <pattern id="pt-tiles" width="170" height="80" patternUnits="userSpaceOnUse" patternTransform="skewX(-25)"><path d="M0 0H170V80H0Z" fill="none" stroke="#d59bad" strokeOpacity=".1"/></pattern>
    </defs>
    <rect width="1440" height="1100" fill="url(#pt-sky)"/>
    <circle cx="1035" cy="610" r="260" fill="url(#pt-sun)"/><circle cx="1035" cy="610" r="72" fill="#ffddb0" opacity=".75"/>
    <g fill="#f5b3c7" opacity=".19"><path d="M0 280Q170 230 430 278T790 260Q1000 235 1200 275L1440 257V279Q1200 300 1000 283T600 300Q240 278 0 307Z"/><path d="M530 510Q680 480 850 507T1150 500L1440 485V505L1100 525Q900 538 740 520Z"/></g>
    <g fill="#9c6997" opacity=".8">{Array.from({length:30},(_,i)=><rect key={i} x={i*51-10} y={665-((i*67)%135)} width={35+(i%3)*9} height={240}/> )}</g>
    <g fill="#624464">{Array.from({length:18},(_,i)=><g key={i}><path d={`M${i*87-10} 840V${640-((i*47)%140)}h${54+(i%3)*10}V840Z`}/><path d={`M${i*87+7} ${640-((i*47)%140)}v-20h15v20Z`}/><rect x={i*87-10} y={660-((i*47)%140)} width={54+(i%3)*10} height="200" fill="url(#pt-windows)"/></g>)}</g>
    <g stroke="#352a46" fill="none"><path d="M0 764H1440M0 777H1440" strokeWidth="9"/>{Array.from({length:25},(_,i)=><path key={i} d={`M${i*60} 770v120`} strokeWidth="5"/>)}</g>
    <path d="M0 880L1440 864V1100H0Z" fill="url(#pt-floor)"/><path d="M0 880L1440 864V1100H0Z" fill="url(#pt-tiles)"/>
    {trap&&<rect width="1440" height="1100" fill="#140b22" opacity=".42"/>}
    <g stroke="#30213c" strokeWidth="5" fill="none"><path d="M-70 60Q330 330 720 145T1510 190"/><path d="M-20 15Q700 400 1480 20"/></g>
    {BULBS.map(([x,y],i)=><g key={i} className="pt-bulb" style={styles[i]}><path d={`M${x} ${y-12}v18`} stroke="#33223d" strokeWidth="4"/><circle cx={x} cy={y+10} r="35" fill="url(#pt-lamp)"/><rect x={x-4} y={y-1} width="8" height="5" fill="#5d3f51"/><ellipse cx={x} cy={y+12} rx="7" ry="10" fill="#ffe7a8"/></g>)}
    <g transform="translate(1110 860)"><path d="M-15 70l15-95 20 95M90 70L75-25 55 70" stroke="#261e33" strokeWidth="7"/><ellipse cx="38" cy="-27" rx="90" ry="22" fill="#8c5069" stroke="#35273d" strokeWidth="6"/><ellipse cx="38" cy="-31" rx="88" ry="19" fill="#bd7e8c"/><path d="M-10-54l4 25h16l4-25Z" fill="#efc39d"/><path d="M52-62v34h17v-34Z" fill="#6b9a9b"/><path d="M60-73v14" stroke="#f4c2b0" strokeWidth="3"/><ellipse cx="45" cy="58" rx="55" ry="11" fill="#19182c" opacity=".4"/></g>
    <g transform="translate(1300 895) rotate(-8)"><path d="M-30-53h66v46h-66Z" fill="#a76a7a" stroke="#3b2a40" strokeWidth="5"/><path d="M-33-3h75v14h-75Z" fill="#a76a7a" stroke="#3b2a40" strokeWidth="5"/><path d="M-29 11l-10 60M34 11l8 60M-27-10v-45M33-10v-45" stroke="#33253d" strokeWidth="6"/></g>
    <g transform="translate(120 940)"><path d="M-55-7h110L40 85h-80Z" fill="#b46c7b" stroke="#4b334b" strokeWidth="5"/><path d="M-45 12h90" stroke="#df9c99" strokeWidth="5"/>{[-65,-33,0,32,60].map((n,i)=><g key={n} transform={`rotate(${n})`}><path d="M0 0Q-40-80 0-185Q35-95 0 0" fill={i%2?'#54726c':'#405b65'} stroke="#6f8b7a" strokeWidth="2"/><path d="M0 0v-155" stroke="#92a08a" strokeWidth="2"/></g>)}</g>
    <g fill="#ffe9ba" opacity=".65"><circle cx="154" cy="381" r="2"/><circle cx="1121" cy="334" r="2"/><circle cx="1290" cy="437" r="2"/><circle cx="800" cy="335" r="1.5"/></g>
  </svg><div className="pt-vignette"/></div>;
}

export default memo(Rooftop);
