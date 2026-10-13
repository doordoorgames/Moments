// Original gameplay, inline artwork and timings from packing-challenge.html.
export function mountPackingChallenge(root, onResult, onContinue, continueLabel) {
  let disposed = false;
  const timeouts = new Set(), intervals = new Set(), frames = new Set();
  const setTimeout = (fn, ms) => { const id = window.setTimeout(() => { timeouts.delete(id); if (!disposed) fn(); }, ms); timeouts.add(id); return id; };
  const clearTimeout = id => { window.clearTimeout(id); timeouts.delete(id); };
  const setInterval = (fn, ms) => { const id = window.setInterval(() => { if (!disposed) fn(); }, ms); intervals.add(id); return id; };
  const clearInterval = id => { window.clearInterval(id); intervals.delete(id); };
  const requestAnimationFrame = fn => { const id = window.requestAnimationFrame(now => { frames.delete(id); if (!disposed) fn(now); }); frames.add(id); return id; };
  const cancelAnimationFrame = id => { window.cancelAnimationFrame(id); frames.delete(id); };
'use strict';
const $ = (s, r = root) => r.querySelector(s);
const $$ = (s, r = root) => [...r.querySelectorAll(s)];
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, REDUCE ? Math.min(ms, 60) : ms));
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

/* ---------- palette + sticker art ---------- */
const COL = { black:'#161616', cream:'#EFE3CC', matcha:'#8DB16C', mint:'#CBE5C0', blush:'#F4BCC9', maroon:'#6B1D2B', denim:'#8BAFD2', indigo:'#3A4E78', camel:'#C79A5E', white:'#FFFFFF', yolk:'#F5C542', grey:'#A9ABA7', stone:'#D6CCB8', charcoal:'#4B4B4B', oat:'#E3D3B5', ink2:'#2A2A33', gold:'#D9B45A', sky:'#BFD8E8', lilac:'#D8C8E8' };
const DARK = new Set(['black','maroon','indigo','charcoal','ink2']);
const P = d => `<path d="${d}"/>`, PN = d => `<path d="${d}" fill="none"/>`;
const R = (x,y,w,h,r=3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const O = (x,y,r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const KNIT = 'M34 16 Q50 24 66 16 L82 22 Q88 26 88 34 L90 72 L78 72 L74 40 L72 88 L28 88 L26 40 L22 72 L10 72 L12 34 Q12 26 18 22 Z';
const COAT = 'M34 8 L50 16 L66 8 L82 16 Q88 20 88 28 L92 70 L80 70 L76 36 L80 94 L20 94 L24 36 L20 70 L8 70 L12 28 Q12 20 18 16 Z';
const SH = {
  hoodie:{s:P('M31 20 Q50 6 69 20 L86 30 Q92 33 91 40 L88 64 L76 62 L74 46 L74 90 L26 90 L26 46 L24 62 L12 64 L9 40 Q8 33 14 30 Z'), d:P('M38 20 Q50 36 62 20 M46 28 L45 40 M54 28 L55 40 M12 58 L24 56 M76 56 L88 58 M26 84 H74')+P('M36 66 H64 L67 80 H33 Z')},
  tee:{s:P('M34 16 Q50 24 66 16 L86 26 L80 44 L70 40 L70 88 L30 88 L30 40 L20 44 L14 26 Z'), d:P('M40 18 Q50 28 60 18 M30 82 H70')},
  knit:{s:P(KNIT), d:P('M38 17 Q50 30 62 17 M28 82 H72 M11 66 H22 M78 66 H89 M42 36 Q46 40 42 44 Q38 48 42 52 Q46 56 42 60 Q38 64 42 68 M58 36 Q62 40 58 44 Q54 48 58 52 Q62 56 58 60 Q54 64 58 68')},
  turtle:{s:P(KNIT)+R(39,6,22,14,4), d:P('M28 82 H72 M11 66 H22 M78 66 H89 M41 12 H59')},
  cardigan:{s:P(KNIT), d:P('M38 17 L50 42 L62 17 M50 42 V88 M28 82 H72 M11 66 H22 M78 66 H89')+O(46,52,1.8)+O(46,64,1.8)+O(46,76,1.8)},
  blazer:{s:P('M34 14 L50 22 L66 14 L84 22 Q88 26 88 32 L90 76 L78 76 L74 40 L74 90 L26 90 L26 40 L22 76 L10 76 L12 32 Q12 26 16 22 Z'), d:P('M34 14 L42 40 L50 54 L58 40 L66 14 M42 40 L36 34 M58 40 L64 34 M50 54 V90 M30 72 H42 M58 72 H70')+O(54,64,1.8)+O(54,76,1.8)},
  shirt:{s:P('M36 14 L50 18 L64 14 L84 24 Q88 28 88 34 L88 70 L78 70 L74 42 L74 88 L26 88 L26 42 L22 70 L12 70 L12 34 Q12 28 16 24 Z'), d:P('M36 14 L43 27 L50 18 L57 27 L64 14 M50 20 V88 M12 64 H22 M78 64 H88')+O(50,38,1.6)+O(50,52,1.6)+O(50,66,1.6)},
  trench:{s:P(COAT), d:P('M34 8 L44 30 L50 40 L56 30 L66 8 M50 40 V94 M24 54 H76')+R(45,50,10,8,1)+O(43,34,1.6)+O(57,34,1.6)+O(43,44,1.6)+O(57,44,1.6)},
  coat:{s:P(COAT), d:P('M34 8 L42 26 L50 34 L58 26 L66 8 M50 34 V94 M28 70 H40 M60 70 H72')+O(54,48,2)+O(54,60,2)},
  joggers:{s:P('M28 10 H72 L76 84 Q76 90 70 90 H58 Q54 90 54 84 L50 40 L46 84 Q46 90 42 90 H30 Q24 90 24 84 Z'), d:P('M28 18 H72 M48 18 L46 28 M52 18 L54 28 M25 80 H46 M54 80 H75')},
  jeans:{s:P('M28 10 H72 L78 90 H56 L50 38 L44 90 H22 Z'), d:P('M28 17 H72 M50 17 V36 M32 17 Q34 28 42 28 M68 17 Q66 28 58 28')+O(50,13.5,1.4)},
  trousers:{s:P('M30 10 H70 L82 90 H56 L50 36 L44 90 H18 Z'), d:P('M30 17 H70 M38 26 L32 88 M62 26 L68 88 M50 17 V32')},
  skirt:{s:P('M32 14 H68 L84 84 H16 Z'), d:P('M32 22 H68 M41 22 L33 84 M50 22 V84 M59 22 L67 84')},
  dress:{s:PN('M38 30 L40 8 M62 30 L60 8')+P('M36 30 H64 Q69 34 66 42 L80 92 H20 L34 42 Q31 34 36 30 Z'), d:P('M36 30 Q50 40 64 30 M30 70 Q50 76 70 70')},
  abaya:{s:P('M38 8 Q50 14 62 8 L80 18 L94 52 L82 58 L74 40 L80 96 H20 L26 40 L18 58 L6 52 L20 18 Z'), d:P('M42 10 Q50 20 58 10 M50 18 V96 M8 49 L19 55 M81 55 L92 49 M22 90 H78')},
  sneakers:{s:P('M12 66 Q12 48 26 46 L40 48 Q50 50 58 58 L80 62 Q90 64 90 72 L90 76 Q90 80 86 80 L16 80 Q12 80 12 76 Z'), d:P('M12 72 H90 M34 50 L40 56 M41 50 L47 56 M48 52 L54 58 M70 61 Q80 64 82 72')},
  loafers:{s:P('M14 70 Q14 58 26 58 L52 58 Q70 58 80 64 Q90 68 90 74 L90 78 Q90 82 86 82 L18 82 Q14 82 14 78 Z'), d:P('M14 76 H90 M46 60 L66 64 M14 70 H30')},
  heels:{s:P('M14 48 Q30 50 44 62 Q58 70 80 68 Q91 68 90 77 L48 78 Q34 78 26 66 L22 90 L17 90 L19 62 Q12 56 14 48 Z'), d:P('M44 62 Q40 70 48 78')},
  boots:{s:P('M22 22 H50 L52 58 Q70 60 84 66 Q92 70 92 78 L92 82 Q92 86 88 86 L22 86 Q18 86 18 82 Z'), d:P('M18 80 H92 M44 26 V58 M22 30 H50')},
  flats:{s:P('M12 70 Q14 60 26 60 Q44 62 60 62 Q84 62 90 72 Q90 80 82 80 L18 80 Q12 80 12 74 Z'), d:P('M28 62 Q46 72 66 62')+O(76,66,2.4)},
  slides:{s:P('M40 68 Q44 46 62 46 Q78 46 80 68 Z')+P('M10 74 Q10 68 18 68 L84 68 Q92 68 92 74 Q92 80 84 80 L18 80 Q10 80 10 74 Z'), d:P('M18 74 H84 M48 56 H74')},
  tote:{s:PN('M34 40 Q34 14 50 14 Q66 14 66 40')+P('M20 38 H80 L74 90 H26 Z'), d:P('M22 48 H78')},
  minibag:{s:PN('M38 46 Q38 24 50 24 Q62 24 62 46')+P('M24 44 H76 Q82 44 82 52 L80 80 Q80 86 74 86 H26 Q20 86 20 80 L18 52 Q18 44 24 44 Z'), d:P('M18 52 Q50 72 82 52')+O(50,62,3)},
  crossbody:{s:PN('M22 52 L50 10 L78 52')+P('M18 50 H82 Q86 50 86 56 L86 82 Q86 88 80 88 H20 Q14 88 14 82 L14 56 Q14 50 18 50 Z'), d:P('M14 62 H86')+R(44,58,12,8,2)},
  duffel:{s:PN('M34 42 Q34 22 50 22 Q66 22 66 42')+P('M14 52 Q14 40 26 40 H74 Q86 40 86 52 V78 Q86 88 74 88 H26 Q14 88 14 78 Z'), d:P('M20 50 H80 M28 40 V88 M72 40 V88')},
  makeup:{s:PN('M40 28 Q40 16 50 16 Q60 16 60 28')+R(14,28,72,58,8), d:P('M14 46 H86')+R(30,41,8,9,1)+R(62,41,8,9,1)},
  styler:{s:P('M14 30 Q14 18 30 18 H66 Q78 18 80 26 L90 24 V40 L80 38 Q78 46 66 46 H56 L60 88 Q60 92 56 92 H46 Q42 92 42 88 L38 46 H30 Q14 46 14 30 Z'), d:O(30,32,7)+P('M44 62 H56 M80 26 V38')},
  perfume:{s:R(16,34,12,10,2)+R(45,16,12,14,2)+R(74,42,10,8,2)+R(10,44,24,40,5)+R(38,30,26,54,6)+R(68,50,22,34,5), d:P('M44 54 H58 M73 64 H85')+O(22,62,4)},
  pouch:{s:P('M12 46 Q12 30 28 30 H72 Q88 30 88 46 V76 Q88 88 76 88 H24 Q12 88 12 76 Z'), d:P('M16 40 H84 M70 40 L74 50')+O(74,53,2.4)},
  charger:{s:R(30,36,40,34,7)+R(39,20,6,18,2)+R(55,20,6,18,2)+PN('M50 70 Q50 88 34 88 Q16 88 18 74 Q20 62 34 66'), d:O(50,53,3)},
  briefs:{s:P('M14 30 H86 L84 44 Q66 50 58 74 H42 Q34 50 16 44 Z'), d:P('M16 38 H84')+O(50,34,2.4)},
  socks:{s:P('M36 10 H60 V56 Q60 60 64 62 L82 70 Q92 76 86 86 Q82 92 72 88 L44 78 Q34 74 34 64 Z'), d:P('M36 20 H60 M36 27 H60')},
  blister:{s:R(18,24,64,52,8), d:O(34,40,6)+O(50,40,6)+O(66,40,6)+O(34,60,6)+O(50,60,6)+O(66,60,6)},
  pads:{s:P('M20 30 Q20 22 28 22 H72 Q80 22 80 30 V70 Q80 78 72 78 H28 Q20 78 20 70 Z'), d:P('M20 38 H80')+O(50,58,5)+O(40,58,3)+O(60,58,3)},
  jar:{s:R(32,12,36,13,3)+R(26,25,48,64,10), d:R(32,44,36,24,3)+O(50,56,4)},
  shampoo:{s:P('M44 8 H56 V20 H62 V28 Q76 32 76 46 V84 Q76 92 68 92 H32 Q24 92 24 84 V46 Q24 32 38 28 V20 H44 Z'), d:P('M34 52 H66 M34 62 H58')},
  watch:{s:R(38,4,24,24,4)+R(38,72,24,24,4)+O(50,50,26), d:O(50,50,18)+P('M50 38 V50 L58 56')},
  burner:{s:P('M50 4 Q62 18 57 28 Q66 26 63 40 H37 Q34 26 43 28 Q38 18 50 4 Z')+P('M26 42 H74 L68 66 H32 Z')+P('M38 66 H62 L68 92 H32 Z'), d:P('M30 54 H70 M42 79 H58')},
};
function svgItem(type, color){
  const sh = SH[type], f = COL[color];
  const dc = DARK.has(color) ? 'rgba(243,235,221,.8)' : 'rgba(17,17,17,.55)';
  return `<svg viewBox="-6 -6 112 112" aria-hidden="true"><g fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round">${sh.s}</g><g fill="${f}" stroke="#111" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${sh.s}</g><g fill="none" stroke="${dc}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${sh.d}</g></svg>`;
}

/* ---------- game data ---------- */
// The visible list. Each comes down the belt three times in near-identical versions.
const LIST = [
  {key:'trench',   label:'Trench coat',  items:[['Grey trench','trench','grey'],['Stone trench','trench','stone'],['Charcoal trench','trench','charcoal']]},
  {key:'knit',     label:'Heavy knit',   items:[['Cream cable knit','knit','cream'],['Oat turtleneck','turtle','oat'],['Grey chunky knit','knit','grey']]},
  {key:'hoodie',   label:'Hoodie',       items:[['Black hoodie','hoodie','black'],['Charcoal hoodie','hoodie','charcoal'],['Ink hoodie','hoodie','ink2']]},
  {key:'trousers', label:'Trousers',     items:[['Black trousers','trousers','black'],['Cream trousers','trousers','cream'],['Grey trousers','trousers','grey']]},
  {key:'dress',    label:'Dinner dress', items:[['Maroon slip dress','dress','maroon'],['Black slip dress','dress','black'],['Blush slip dress','dress','blush']]},
  {key:'heels',    label:'Heels',        items:[['Blush heels','heels','blush'],['Maroon heels','heels','maroon'],['Black heels','heels','black']]},
  {key:'sneakers', label:'Sneakers',     items:[['White sneakers','sneakers','white'],['Cream sneakers','sneakers','cream'],['Black sneakers','sneakers','black']]},
  {key:'dinner',   label:'Dinner bag',   items:[['Maroon mini bag','minibag','maroon'],['Black mini bag','minibag','black'],['Blush mini bag','minibag','blush']]},
];
// Never shown on the list and never highlighted on the belt. Zain only says "pack your essentials".
const ESSENTIALS = [
  {key:'intimates', label:'Underwear',     items:[['Underwear set','briefs','blush']]},
  {key:'socks',     label:'Socks',         items:[['Wool socks','socks','cream']]},
  {key:'charger',   label:'Charger',       items:[['USB charger','charger','white']]},
  {key:'shampoo',   label:'Shampoo',       items:[['Shampoo','shampoo','mint']]},
  {key:'makeup',    label:'Makeup kit',    items:[['Makeup kit','makeup','blush'],['Natural makeup kit','makeup','oat']]},
  {key:'pain',      label:'Pain relief',   items:[['Pain relief tablets','blister','white']]},
  {key:'pads',      label:'Period pads',   items:[['Period pads','pads','lilac']]},
  {key:'digest',    label:'Digestive meds',items:[['Digestive tablets','jar','sky']]},
  {key:'hair',      label:'Hair vitamins', items:[['Hair vitamins','jar','blush']]},
  {key:'watch',     label:'Watch',         items:[['Gold watch','watch','gold']]},
];
const DECOYS = [
  ['White tee','tee','white'], ['Pleated skirt','skirt','cream'], ['Pool slides','slides','matcha'],
  ['Dark jeans','jeans','indigo'], ['Black blazer','blazer','black'], ['Matcha joggers','joggers','matcha'],
];
const FORBIDDEN = [['Charcoal bukhoor set','burner','maroon']];
const MEMO_SECS = 10, PASS = 80;

const ZAIN_INTRO = "Shoug. Three days in London. I am sending you a list, memorise it. One of each, no doubles. And make sure you pack your essentials, habibti. You know what you need. Yalla.";
const ZAIN_LIST = "Trench, heavy knit, hoodie, trousers, a dinner dress, heels, sneakers, and one dinner bag. One of each. And your essentials.";

/* ---------- sound ---------- */
const SFX = (() => {
  let ctx = null, muted = false;
  const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } if (ctx && ctx.state === 'suspended') ctx.resume(); return ctx; };
  function tone(freq, dur, type='sine', gain=.2, slide=null, delay=0){
    const a = ac(); if (!a || muted) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .03);
  }
  function noise(dur, {gain=.2, f1=800, f2=800, q=1, type='bandpass', delay=0} = {}){
    const a = ac(); if (!a || muted) return;
    const t = a.currentTime + delay, len = Math.max(1, Math.floor(a.sampleRate * dur));
    const b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b;
    const fl = a.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(fl).connect(g).connect(a.destination); s.start(t); s.stop(t + dur);
  }
  return {
    unlock: ac,
    get muted(){ return muted; }, set muted(v){ muted = v; },
    pop(){ tone(520,.09,'sine',.25,980); },
    whoosh(){ noise(.22,{gain:.22,f1:400,f2:3200,q:.8}); },
    thud(){ tone(170,.16,'sine',.35,60); },
    tick(){ tone(1400,.035,'square',.06); },
    close(){ if (ctx) { ctx.close().catch(() => {}); ctx = null; } },
    zip(){ for (let i = 0; i < 12; i++) noise(.035,{gain:.16,f1:2400+i*140,f2:3000+i*140,q:4,delay:i*.04}); },
    ding(){ tone(880,.5,'sine',.2); tone(1320,.6,'sine',.15,null,.08); tone(1760,.7,'sine',.1,null,.16); },
    gold(){ tone(1046,.12,'triangle',.18); tone(1568,.18,'triangle',.14,null,.07); },
    groan(){ tone(150,.32,'sawtooth',.09,90); },
    buzz(){ tone(140,.5,'sawtooth',.12,110); tone(146,.5,'sawtooth',.08,112); },
    crash(){ noise(.9,{gain:.5,f1:1800,f2:120,q:.5,type:'lowpass'}); tone(110,.45,'sine',.45,40); },
    blip(base){ tone(base*(.85+Math.random()*.4),.07,'triangle',.11); },
    scale(){ tone(2100,.02,'square',.035); },
    chime(){ tone(660,.25,'sine',.15); tone(880,.35,'sine',.12,null,.12); },
  };
})();

/* ---------- helpers ---------- */
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
function show(id){
  $$('.screen').forEach(s => {
    if (s.id === id){ s.hidden = false; s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter'); s.scrollTop = 0; }
    else s.hidden = true;
  });
}
function fly(html, from, to, {dur=520, spin=0} = {}){
  return new Promise(res => {
    if (!from || !to || !from.width) return res();
    const d = document.createElement('div'); d.className = 'flyer'; d.innerHTML = html;
    Object.assign(d.style, {left:from.left+'px', top:from.top+'px', width:from.width+'px', height:from.height+'px'});
    root.querySelector(".packing-world").appendChild(d);
    const dx = to.left + to.width/2 - (from.left + from.width/2), dy = to.top + to.height/2 - (from.top + from.height/2);
    const s = to.width / from.width;
    const a = d.animate([
      {transform:'translate(0,0) scale(1) rotate(0deg)'},
      {transform:`translate(${dx*.5}px,${dy*.5 - 90}px) scale(${(1+s)/2*1.18}) rotate(${spin/2}deg)`, offset:.5},
      {transform:`translate(${dx}px,${dy}px) scale(${s}) rotate(${spin}deg)`}
    ], {duration: REDUCE ? 1 : dur, easing:'cubic-bezier(.3,.7,.4,1)'});
    a.onfinish = () => { d.remove(); res(); };
  });
}
function physics(parts, {floor = Infinity, life = 4200} = {}){
  const t0 = performance.now();
  function f(n){
    const W = innerWidth; let moving = false;
    for (const p of parts){
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx *= .995;
      if (p.y > floor - p.s){
        p.y = floor - p.s;
        if (Math.abs(p.vy) > 1.5){ p.vy *= -.42; p.vx *= .75; p.vr *= .6; } else { p.vy = 0; p.vx *= .85; p.vr *= .8; }
      }
      if (floor !== Infinity){ if (p.x < 0){ p.x = 0; p.vx *= -.7; } if (p.x > W - p.s){ p.x = W - p.s; p.vx *= -.7; } }
      p.el.style.transform = `translate(${p.x}px,${p.y}px) rotate(${p.r}deg)`;
      if (Math.abs(p.vx) > .05 || Math.abs(p.vy) > .05) moving = true;
    }
    if (moving && n - t0 < life) requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}
function ring(el){
  const fg = $('.ring-fg', el), num = $('.ring-num', el), L = 125.66;
  return (shown, frac, hurry) => { num.textContent = shown; fg.style.strokeDashoffset = L * (1 - Math.max(0, frac)); el.classList.toggle('hurry', !!hurry); };
}
function makeTimer(el, secs, onEnd){
  const draw = ring(el);
  let left = secs, id = null, last = 0, lastWhole = secs;
  const paint = () => draw(Math.max(0, Math.ceil(left)), left / secs, left <= 5 && left > 0);
  paint();
  const api = {
    start(){ last = performance.now(); clearInterval(id); id = setInterval(() => {
      const n = performance.now(); left -= (n - last) / 1000; last = n;
      const w = Math.ceil(left); if (w !== lastWhole){ lastWhole = w; if (w <= 5 && w > 0) SFX.tick(); }
      paint(); if (left <= 0){ api.stop(); onEnd(); }
    }, 100); },
    stop(){ clearInterval(id); id = null; el.classList.remove('hurry'); }
  };
  return api;
}
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
const wordMs = w => 150 + w.length * 26 + (/[.,!?]$/.test(w) ? 210 : 0);
function voiceNote(host, {from, text, base = 150}){
  const words = text.split(/\s+/);
  const total = words.reduce((a, w) => a + wordMs(w), 0);
  const bars = Array.from({length:30}, (_, i) => { const h = .25 + .75 * Math.abs(Math.sin(i * 1.7 + text.length) * Math.cos(i * .6)); return `<i style="--h:${h.toFixed(2)};--d:${-(i*.07).toFixed(2)}s"></i>`; }).join('');
  host.classList.remove('played','playing');
  host.innerHTML = `<div class="vn"><button class="vn-play" type="button" aria-label="Play voice note from ${from}">${ICON_PLAY}</button><div class="vn-wave">${bars}</div><span class="vn-time">0:${String(Math.round(total/1000)).padStart(2,'0')}</span></div><p class="vn-tx">${words.map(w => `<span>${w}</span>`).join(' ')}</p>`;
  const btn = $('.vn-play', host), barEls = $$('.vn-wave i', host), spans = $$('.vn-tx span', host);
  let timer = null, idx = 0, playing = false;
  const setBars = p => barEls.forEach((b, i) => b.classList.toggle('on', i / barEls.length < p));
  function finish(){ clearTimeout(timer); playing = false; spans.forEach(s => s.classList.add('on')); setBars(1); btn.innerHTML = ICON_PLAY; btn.setAttribute('aria-label', `Replay voice note from ${from}`); host.classList.add('played'); host.classList.remove('playing'); }
  function step(){
    if (idx >= words.length) return finish();
    const w = words[idx]; spans[idx].classList.add('on'); setBars((idx + 1) / words.length);
    const syl = Math.min(3, Math.max(1, (w.match(/[aeiouy]+/gi) || []).length));
    for (let k = 0; k < syl; k++) setTimeout(() => { if (playing) SFX.blip(base); }, k * 70);
    idx++; timer = setTimeout(step, wordMs(w));
  }
  function play(){ SFX.unlock(); idx = 0; spans.forEach(s => s.classList.remove('on')); setBars(0); playing = true; host.classList.add('playing'); btn.innerHTML = ICON_PAUSE; btn.setAttribute('aria-label','Skip to the end'); step(); }
  btn.onclick = () => playing ? finish() : play();
  return { play, stop(){ if (playing){ clearTimeout(timer); playing = false; host.classList.remove('playing'); btn.innerHTML = ICON_PLAY; } } };
}
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }



/* ---------- state ---------- */
const S = { grabbed:[], bits:[] };
let introVN = null, listVN = null, replyVN = null, memoTimer = null, beltRAF = null;

/* ---------- intro ---------- */
$('#cl1').innerHTML = svgItem('trench','grey');
$('#cl2').innerHTML = svgItem('watch','gold');
$('#cl3').innerHTML = svgItem('shampoo','mint');
introVN = voiceNote($('#vnIntro'), {from:'Zain', text:ZAIN_INTRO, base:140});
$('#muteBtn').onclick = e => { SFX.muted = !SFX.muted; e.currentTarget.setAttribute('aria-pressed', SFX.muted); e.currentTarget.textContent = SFX.muted ? 'Sound off' : 'Sound on'; };
$('#startBtn').onclick = () => { SFX.unlock(); SFX.pop(); introVN.stop(); startList(); };

/* ---------- memorise ---------- */
function startList(){
  clearBits();
  $('#listGrid').innerHTML = LIST.map((c, i) => `<div class="li" style="--i:${i}"><span class="li-art">${svgItem(c.items[0][1], c.items[0][2])}</span>${c.label}</div>`).join('');
  $('#memo').classList.remove('hide');
  $('#memoBtn').disabled = false; $('#memoBtn').textContent = "I've got it";
  const bar = $('#memoBar'); bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)';
  show('list');
  listVN = voiceNote($('#vnList'), {from:'Zain', text:ZAIN_LIST, base:140});
  setTimeout(() => listVN.play(), 350);
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `transform ${MEMO_SECS}s linear`; bar.style.transform = 'scaleX(0)'; }));
  clearTimeout(memoTimer); memoTimer = setTimeout(endList, MEMO_SECS * 1000);
}
$('#memoBtn').onclick = () => endList();
async function endList(){
  clearTimeout(memoTimer);
  if ($('#memoBtn').disabled) return;
  $('#memoBtn').disabled = true; $('#memoBtn').textContent = 'Belt starting';
  if (listVN) listVN.stop();
  $('#memo').classList.add('hide'); SFX.whoosh();
  await wait(1100); startBelt();
}

/* ---------- the belt ---------- */
function buildBelt(){
  const seq = [];
  const add = (group, kind) => group.forEach(c => c.items.forEach(([name, type, color], i) => seq.push({id:`${c.key}-${i}`, cat:c.key, name, type, color, kind})));
  add(LIST, 'list'); add(ESSENTIALS, 'ess');
  DECOYS.forEach(([name, type, color], i) => seq.push({id:`decoy-${i}`, cat:`decoy-${i}`, name, type, color, kind:'decoy'}));
  FORBIDDEN.forEach(([name, type, color], i) => seq.push({id:`bad-${i}`, cat:`bad-${i}`, name, type, color, kind:'forbidden'}));
  const s = shuffle(seq);
  for (let pass = 0; pass < 10; pass++){
    for (let i = 1; i < s.length; i++){
      if (s[i].cat === s[i-1].cat){ const j = (i + 4 + Math.floor(Math.random() * 6)) % s.length; [s[i], s[j]] = [s[j], s[i]]; }
    }
  }
  return s;
}
function startBelt(){
  S.grabbed = [];
  const seq = buildBelt(), total = seq.length;
  const lane = $('#lane'), track = $('#track'), slats = $('#slats'), mini = $('#miniCase');
  lane.innerHTML = ''; mini.classList.remove('strain'); mini.style.setProperty('--bulge', 1);
  $('#countTag').textContent = '0'; $('#leftNum').textContent = total; $('#speedSign').textContent = 'Speed 1x';
  const draw = ring($('#beltRing')); draw(total, 1, false);
  show('belt');
  const live = []; let spawned = 0, sinceSpawn = 1, last = 0, slatX = 0, done = false, speedStep = 1;
  const W = () => track.clientWidth;
  const left = () => total - spawned + live.length;
  function spawn(){
    const it = seq[spawned++];
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'bi';
    el.setAttribute('aria-label', `Grab ${it.name}`);
    el.innerHTML = `<span class="bi-art">${svgItem(it.type, it.color)}</span><span class="bl">${it.name}</span>`;
    lane.appendChild(el);
    const o = {it, el, x: W() + 8, wob: Math.random() * 6.28};
    el.style.transform = `translateX(${o.x}px)`;
    el.addEventListener('pointerdown', ev => { ev.preventDefault(); grab(o); });
    el.addEventListener('click', ev => { if (ev.detail === 0) grab(o); });
    live.push(o);
  }
  function grab(o){
    if (done || o.gone) return;
    o.gone = true;
    const idx = live.indexOf(o); if (idx > -1) live.splice(idx, 1);
    const from = $('.bi-art', o.el).getBoundingClientRect();
    o.el.remove();
    S.grabbed.push(o.it);
    $('#countTag').textContent = S.grabbed.length;
    mini.style.setProperty('--bulge', (1 + Math.min(S.grabbed.length, 22) * .014).toFixed(3));
    mini.classList.toggle('strain', S.grabbed.length >= 20);
    SFX.pop();
    fly(svgItem(o.it.type, o.it.color), from, $('.b', mini).getBoundingClientRect(), {dur:430, spin: hash(o.it.id) * 90 - 45}).then(() => {
      SFX.thud(); mini.classList.remove('gulp'); void mini.offsetWidth; mini.classList.add('gulp');
    });
    draw(left(), left() / total, false); $('#leftNum').textContent = left();
  }
  function frame(now){
    if (done) return;
    if (!last) last = now;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const prog = spawned / total;
    const travel = lerp(4.2, 2.4, prog), gap = lerp(1.3, .8, prog);
    const speed = (W() + 130) / travel;
    sinceSpawn += dt;
    if (spawned < total && sinceSpawn >= gap){ sinceSpawn = 0; spawn(); }
    for (let i = live.length - 1; i >= 0; i--){
      const o = live[i]; o.x -= speed * dt; o.wob += dt * 9;
      o.el.style.transform = `translateX(${o.x.toFixed(1)}px) translateY(${(Math.sin(o.wob) * 2).toFixed(1)}px)`;
      if (o.x < -126){ o.el.remove(); live.splice(i, 1); draw(left(), left() / total, left() <= 4 && left() > 0); $('#leftNum').textContent = left(); }
    }
    slatX -= speed * dt; slats.style.backgroundPosition = `${slatX.toFixed(1)}px 0`;
    const step = prog > .66 ? 3 : prog > .33 ? 2 : 1;
    if (step !== speedStep){ speedStep = step; $('#speedSign').textContent = `Speed ${step}x`; toast(step === 2 ? 'The belt is speeding up.' : 'Last stretch. Faster.'); SFX.tick(); }
    if (spawned >= total && !live.length){ finishBelt(); return; }
    beltRAF = requestAnimationFrame(frame);
  }
  function finishBelt(){
    if (done) return; done = true; cancelAnimationFrame(beltRAF);
    live.forEach(o => o.el.remove()); live.length = 0;
    $('#beltRing').classList.remove('hurry');
    SFX.zip(); toast('Zipped.');
    setTimeout(renderResult, REDUCE ? 50 : 1000);
  }
  $('#zipNow').onclick = () => finishBelt();
  cancelAnimationFrame(beltRAF);
  beltRAF = requestAnimationFrame(frame);
}

/* ---------- scoring ---------- */
function audit(){
  const counts = {};
  S.grabbed.forEach(g => counts[g.cat] = (counts[g.cat] || 0) + 1);
  const tile = (c) => ({key:c.key, label:c.label, art:svgItem(c.items[0][1], c.items[0][2]), n:counts[c.key] || 0});
  const list = LIST.map(tile), ess = ESSENTIALS.map(tile);
  const required = [...list, ...ess];
  const covered = required.filter(r => r.n).length;
  const missing = required.filter(r => !r.n);
  const dups = required.filter(r => r.n > 1);
  const doubles = dups.reduce((a, r) => a + r.n - 1, 0);
  const extras = S.grabbed.filter(g => g.kind === 'decoy');
  const forbidden = S.grabbed.filter(g => g.kind === 'forbidden');
  const wrong = missing.length + doubles + extras.length + forbidden.length * 2;
  const pct = Math.round(covered / (required.length + doubles + extras.length + forbidden.length * 2) * 100);
  return {list, ess, required, covered, missing, dups, doubles, extras, forbidden, wrong, pct};
}
const letterFor = p => p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';

/* ---------- result ---------- */
function clearBits(){ S.bits.forEach(b => b.remove()); S.bits = []; }
function confetti(){
  const cols = [COL.matcha, COL.blush, COL.yolk, COL.cream, COL.maroon];
  const parts = Array.from({length: REDUCE ? 0 : 50}, (_, i) => {
    const el = document.createElement('div'); el.className = 'conf';
    const w = 8 + Math.random() * 8, h = 5 + Math.random() * 6;
    Object.assign(el.style, {width: w + 'px', height: h + 'px', background: cols[i % cols.length]});
    root.querySelector(".packing-world").appendChild(el); S.bits.push(el);
    return {el, s: w, x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .3, vx: (Math.random() - .5) * 14, vy: -(8 + Math.random() * 10), r: Math.random() * 360, vr: (Math.random() - .5) * 30, g: .38};
  });
  physics(parts, {life: 3800});
  setTimeout(() => parts.forEach(p => p.el.remove()), 3900);
}
function zainReply(A, passed){
  const has = k => A.required.find(r => r.key === k).n > 0;
  const lines = [];
  if (A.forbidden.length) lines.push('A charcoal bukhoor set in a suitcase? With the lighter fluid? Security is going to love you.');
  if (!has('intimates')) lines.push('No underwear, Shoug. For three days. Think about that.');
  if (!has('socks')) lines.push('No socks. In London. In winter.');
  if (!has('sneakers') && has('heels')) lines.push('Only heels? You will be crying on Oxford Street by noon.');
  const jacket = A.dups.find(d => d.key === 'trench' || d.key === 'knit' || d.key === 'hoodie');
  if (jacket) lines.push(`Two ${jacket.label.toLowerCase()}s? Who is the second one for?`);
  if (A.dups.find(d => d.key === 'makeup')) lines.push('Two makeup kits, habibti. You have one face.');
  if (!has('charger')) lines.push('No charger. You are not borrowing mine.');
  if (A.extras.length >= 2) lines.push('And half of that was not even on the list.');
  const pick = lines.slice(0, 2).join(' ');
  if (passed) return (pick ? pick + ' But fine. ' : 'One of everything. I am impressed. ') + 'Yalla, lounge together.';
  return (pick || 'Shoug. That is not what I asked for.') + ' I am going to the lounge. Repack and meet me there.';
}
function renderResult(){
  const A = audit(), grade = letterFor(A.pct), passed = A.pct >= PASS;
  const verdicts = {A:'Carry-On Icon', B:'Packed Like a Pro', C:'Gate Change Panic', D:'Overpacked Mess', F:'Missed Boarding'};
  const L = $('#letter'); L.textContent = grade; L.classList.toggle('fail', !passed); L.classList.remove('in'); void L.offsetWidth; L.classList.add('in');
  $('#verdict').textContent = verdicts[grade];
  $('#passLine').textContent = passed ? 'Passed · B and above' : `Failed · needs ${PASS}% for a B`;
  $('#loungeTx').textContent = passed ? 'Lounge together. Zain is ordering your coffee.' : 'Zain went ahead. You are repacking at desk 4.';
  $('#lounge').classList.toggle('bad', !passed);
  const ck = r => { const cls = !r.n ? ' miss' : r.n > 1 ? ' dup' : ''; const tag = !r.n ? 'Missing' : r.n > 1 ? `x${r.n}` : 'Packed'; return `<div class="ck${cls}"><span class="ck-art">${r.art}</span>${r.label}<em>${tag}</em></div>`; };
  $('#ckList').innerHTML = A.list.map(ck).join('');
  $('#ckEss').innerHTML = A.ess.map(ck).join('');
  $('#listCount').textContent = `${A.list.filter(r => r.n).length} of ${A.list.length}`;
  $('#essCount').textContent = `${A.ess.filter(r => r.n).length} of ${A.ess.length}`;
  const bad = [...A.forbidden.map(g => ({...g, tag:'Banned'})), ...A.extras.map(g => ({...g, tag:'Extra'}))];
  $('#ckBad').innerHTML = bad.length ? bad.map(g => `<div class="ck bad"><span class="ck-art">${svgItem(g.type, g.color)}</span>${g.name}<em>${g.tag}</em></div>`).join('') : '<p class="empty-note">Nothing. Clean bag.</p>';
  $('#badCount').textContent = `${bad.length + A.doubles} ${bad.length + A.doubles === 1 ? 'piece' : 'pieces'}${A.doubles ? `, ${A.doubles} double${A.doubles > 1 ? 's' : ''}` : ''}`;
  replyVN = voiceNote($('#vnReply'), {from:'Zain', text:zainReply(A, passed), base:140});
  show('result');
  const el = $('#pct'), t0 = performance.now(), dur = REDUCE ? 1 : 1100;
  const f = n => { const p = Math.min(1, (n - t0) / dur); el.textContent = Math.round(A.pct * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
  if (passed){ SFX.ding(); confetti(); } else SFX.buzz();
  setTimeout(() => replyVN.play(), REDUCE ? 50 : 1400);
  S.result = {grade, percent:A.pct, passed, missing:A.missing.map(r => r.key), doubles:A.doubles, extras:A.extras.map(e => e.name), forbidden:A.forbidden.map(e => e.name)};
  onResult(S.result);
}
$('#againBtn').textContent = continueLabel;
$('#againBtn').onclick = () => { SFX.pop(); if (replyVN) replyVN.stop(); onContinue(S.result); };

  return () => {
    disposed = true;
    introVN?.stop(); listVN?.stop(); replyVN?.stop();
    timeouts.forEach(window.clearTimeout); intervals.forEach(window.clearInterval); frames.forEach(window.cancelAnimationFrame);
    root.querySelectorAll('*').forEach(el => el.getAnimations().forEach(animation => animation.cancel()));
    clearBits(); SFX.close(); root.innerHTML = '';
  };
}
