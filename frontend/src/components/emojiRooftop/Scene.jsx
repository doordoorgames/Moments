import React, {memo} from 'react';

// Night rooftop: sky, skyline, string lights and a cobblestone floor. Pure decoration.
const BULBS = Array.from({length: 15}, (_, i) => {
  const x = i * 30 + 6;
  return [x, 32 + Math.sin((x / 450) * Math.PI) * 46];
});
const BULB_COLORS = ['#ffd27a', '#ff9fc4', '#ffb35c', '#c9a7ff'];
const STARS = [[22,18],[71,44],[118,12],[164,58],[212,24],[262,9],[301,48],[348,20],[392,52],[430,14],[58,92],[188,96],[322,88],[410,104],[140,120]];

const FAR = [[0,330,40],[38,300,34],[70,345,28],[96,280,38],[132,320,30],[160,262,26],[184,310,40],[222,290,30],[250,335,36],[284,270,32],[314,315,40],[352,295,30],[380,330,36],[414,285,40]];
const NEAR = [[-6,388,52],[44,360,40],[82,402,46],[126,350,34],[158,392,50],[206,370,38],[242,410,44],[284,356,36],[318,396,52],[368,372,40],[406,398,50]];
// Sparse lit windows, fixed pseudo-random so they never jump between renders.
const WINDOWS = NEAR.flatMap(([x,y,w],b)=>{
  const out=[];
  for (let r=0;r<5;r++) for (let c=0;c<Math.floor((w-6)/11);c++) {
    const h=(b*97+r*31+c*17)%11;
    if (h<3) out.push([x+6+c*11, y+10+r*15, h===0?'#ff9fc4':'#ffc979']);
  }
  return out;
});

function Scene() {
  return <div className="er-scene" aria-hidden="true">
    <svg className="er-sky" viewBox="0 0 450 560" preserveAspectRatio="xMidYMin slice">
      <defs>
        <linearGradient id="er-sky-g" x2="0" y2="1">
          <stop stopColor="#120c28"/><stop offset=".45" stopColor="#2c1850"/><stop offset=".78" stopColor="#5e2a6e"/><stop offset="1" stopColor="#a8456f"/>
        </linearGradient>
        <radialGradient id="er-glow"><stop stopColor="#fff2c6" stopOpacity=".95"/><stop offset=".25" stopColor="#ffc46b" stopOpacity=".55"/><stop offset="1" stopColor="#ffb35c" stopOpacity="0"/></radialGradient>
        <radialGradient id="er-moon-g"><stop stopColor="#fff4d6" stopOpacity=".5"/><stop offset="1" stopColor="#fff4d6" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="450" height="560" fill="url(#er-sky-g)"/>
      {STARS.map(([x, y], i) => <circle key={i} className="er-star" style={{animationDelay: `${(i * .37) % 3}s`}} cx={x} cy={y} r={i % 3 ? 1.1 : 1.7} fill="#fff1d6"/>)}
      <circle cx="356" cy="122" r="58" fill="url(#er-moon-g)"/>
      <circle cx="356" cy="122" r="22" fill="#fff0cf"/><circle cx="364" cy="116" r="20" fill="#2c1850" opacity=".9"/>
      {/* far skyline */}
      <g fill="#3c1f68">{FAR.map(([x,y,w],i)=><rect key={i} x={x} y={y} width={w} height={560-y}/>)}</g>
      {/* near skyline with a few warm windows */}
      <g fill="#251444">{NEAR.map(([x,y,w],i)=><g key={i}><rect x={x} y={y} width={w} height={560-y}/>{i%3===1&&<path d={`M${x+w/2} ${y}v-16`} stroke="#251444" strokeWidth="3"/>}</g>)}</g>
      <g>{WINDOWS.map(([x,y,c],i)=><rect key={i} x={x} y={y} width="5" height="7" rx="1" fill={c}/>)}</g>
      {/* parapet */}
      <rect y="452" width="450" height="16" fill="#1a0f2e"/><rect y="448" width="450" height="5" fill="#4a2a63"/>
      {/* string lights */}
      <path d={`M-10 30 ${BULBS.map(([x, y]) => `L${x} ${y}`).join(' ')} L460 30`} fill="none" stroke="#1a0f2e" strokeWidth="2.2"/>
      {BULBS.map(([x, y], i) => <g key={i} className="er-bulb" style={{animationDelay: `${(i * .41) % 2.6}s`}}>
        <circle cx={x} cy={y + 9} r="17" fill="url(#er-glow)"/>
        <rect x={x - 2.5} y={y} width="5" height="4" fill="#1a0f2e"/>
        <ellipse cx={x} cy={y + 9} rx="4.2" ry="5.6" fill={BULB_COLORS[i % 4]}/>
      </g>)}
    </svg>
    <div className="er-floor"/>
  </div>;
}

export default memo(Scene);
