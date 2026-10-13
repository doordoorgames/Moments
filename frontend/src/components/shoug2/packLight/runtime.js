// Gameplay ported from the supplied HTML. All selectors and effects stay in the shadow root.
export function mountPackLight(root, onResult, onContinue) {
  let disposed = false, finalResult = null;
  const timeouts = new Set(), intervals = new Set(), frames = new Set();
  const setTimeout = (fn, ms) => { const id = window.setTimeout(() => { timeouts.delete(id); if(!disposed) fn(); }, ms); timeouts.add(id); return id; };
  const clearTimeout = id => { window.clearTimeout(id); timeouts.delete(id); };
  const setInterval = (fn, ms) => { const id = window.setInterval(() => { if(!disposed) fn(); }, ms); intervals.add(id); return id; };
  const clearInterval = id => { window.clearInterval(id); intervals.delete(id); };
  const requestAnimationFrame = fn => { const id = window.requestAnimationFrame(t => { frames.delete(id); if(!disposed) fn(t); }); frames.add(id); return id; };


const $ = (s, r = root) => r.querySelector(s);
const $$ = (s, r = root) => [...r.querySelectorAll(s)];
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, REDUCE ? Math.min(ms, 60) : ms));
const hash = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };

/* ---------- palette + sticker art ---------- */
const COL = { black:'#161616', cream:'#EFE3CC', matcha:'#8DB16C', mint:'#CBE5C0', blush:'#F4BCC9', maroon:'#6B1D2B', denim:'#8BAFD2', indigo:'#3A4E78', camel:'#C79A5E', white:'#FFFFFF', yolk:'#F5C542' };
const COLNAME = { black:'Black', cream:'Cream', matcha:'Matcha', blush:'Blush', maroon:'Maroon', denim:'Denim' };
const DARK = new Set(['black','maroon','indigo']);
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
};
function svgItem(type, color){
  const sh = SH[type], f = COL[color];
  const dc = DARK.has(color) ? 'rgba(243,235,221,.8)' : 'rgba(17,17,17,.55)';
  return `<svg viewBox="-6 -6 112 112" aria-hidden="true"><g fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round">${sh.s}</g><g fill="${f}" stroke="#111" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">${sh.s}</g><g fill="none" stroke="${dc}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${sh.d}</g></svg>`;
}

/* ---------- game data ---------- */
const SLOTS = ['top','bottom','shoes','bag'];
const LABEL = { top:'Top', bottom:'Bottom', shoes:'Shoes', bag:'Bag' };
const WEAR = {
  top:[{id:'w-hoodie',name:'Matcha hoodie',type:'hoodie',color:'matcha',comfort:10},{id:'w-knit',name:'Cream knit',type:'knit',color:'cream',comfort:9},{id:'w-blazer',name:'Black blazer',type:'blazer',color:'black',comfort:4},{id:'w-shirt',name:'Blush satin shirt',type:'shirt',color:'blush',comfort:6}],
  bottom:[{id:'w-jog',name:'Matcha joggers',type:'joggers',color:'matcha',comfort:10},{id:'w-wide',name:'Cream trousers',type:'trousers',color:'cream',comfort:8},{id:'w-leather',name:'Leather skirt',type:'skirt',color:'black',comfort:3},{id:'w-jeans',name:'Light jeans',type:'jeans',color:'denim',comfort:6}],
  shoes:[{id:'w-sneak',name:'Cream sneakers',type:'sneakers',color:'cream',comfort:10},{id:'w-loaf',name:'Black loafers',type:'loafers',color:'black',comfort:7},{id:'w-heels',name:'Maroon heels',type:'heels',color:'maroon',comfort:2},{id:'w-slides',name:'Matcha slides',type:'slides',color:'matcha',comfort:8}],
  bag:[{id:'w-tote',name:'Black tote',type:'tote',color:'black',comfort:8},{id:'w-mini',name:'Maroon mini bag',type:'minibag',color:'maroon',comfort:5},{id:'w-cross',name:'Cream crossbody',type:'crossbody',color:'cream',comfort:9},{id:'w-duffel',name:'Matcha duffel',type:'duffel',color:'matcha',comfort:7}],
};
// Hidden weights in kg. The player never sees these until the score screen.
const PACK = [
  {id:'tee',name:'White tee',type:'tee',color:'white',w:0.2,cat:'top'},
  {id:'turtle',name:'Black turtleneck',type:'turtle',color:'black',w:0.4,cat:'top',warm:true},
  {id:'blouse',name:'Blush blouse',type:'shirt',color:'blush',w:0.3,cat:'top'},
  {id:'cardi',name:'Mint cardigan',type:'cardigan',color:'mint',w:0.6,cat:'top',warm:true},
  {id:'jeans',name:'Dark jeans',type:'jeans',color:'indigo',w:0.9,cat:'bottom'},
  {id:'skirt',name:'Pleated skirt',type:'skirt',color:'cream',w:0.5,cat:'bottom'},
  {id:'trousers',name:'Black trousers',type:'trousers',color:'black',w:0.7,cat:'bottom'},
  {id:'slip',name:'Maroon slip dress',type:'dress',color:'maroon',w:0.4,cat:'full'},
  {id:'abaya',name:'Black abaya',type:'abaya',color:'black',w:0.8,cat:'full'},
  {id:'trench',name:'Camel trench',type:'trench',color:'camel',w:1.8,cat:'outer',warm:true},
  {id:'coat',name:'Wool coat',type:'coat',color:'cream',w:2.9,cat:'outer',warm:true},
  {id:'boots',name:'Ankle boots',type:'boots',color:'black',w:2.6,cat:'shoes'},
  {id:'heels',name:'Blush heels',type:'heels',color:'blush',w:0.9,cat:'shoes'},
  {id:'flats',name:'Ballet flats',type:'flats',color:'maroon',w:0.5,cat:'shoes'},
  {id:'sneak2',name:'Spare sneakers',type:'sneakers',color:'white',w:1.3,cat:'shoes'},
  {id:'makeup',name:'Makeup case',type:'makeup',color:'blush',w:3.6,cat:'extra'},
  {id:'styler',name:'Hair styler',type:'styler',color:'mint',w:2.6,cat:'extra'},
  {id:'perfume',name:'Perfume trio',type:'perfume',color:'yolk',w:1.8,cat:'extra'},
  {id:'toiletry',name:'Toiletry bag',type:'pouch',color:'matcha',w:1.2,cat:'extra'},
];
const CASE_KG = 4.2, LIMIT = 23, ROOM_TARGET = 19;
const WEAR_SECS = 20, PACK_SECS = 30;

const ZAIN_INTRO = "Shoug. Habibti. Do not overpack. We are shopping in London, so leave room in that suitcase. Wear something comfy for the flight. Yalla, the driver is outside.";

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
    close(){ if(ctx) ctx.close().catch(() => {}); },
    get muted(){ return muted; }, set muted(v){ muted = v; },
    pop(){ tone(520,.09,'sine',.25,980); },
    whoosh(){ noise(.22,{gain:.22,f1:400,f2:3200,q:.8}); },
    thud(){ tone(170,.16,'sine',.35,60); },
    tick(){ tone(1400,.035,'square',.06); },
    zip(){ for (let i = 0; i < 12; i++) noise(.035,{gain:.16,f1:2400+i*140,f2:3000+i*140,q:4,delay:i*.04}); },
    ding(){ tone(880,.5,'sine',.2); tone(1320,.6,'sine',.15,null,.08); tone(1760,.7,'sine',.1,null,.16); },
    buzz(){ tone(140,.5,'sawtooth',.12,110); tone(146,.5,'sawtooth',.08,112); },
    crash(){ noise(.9,{gain:.5,f1:1800,f2:120,q:.5,type:'lowpass'}); tone(110,.45,'sine',.45,40); },
    blip(base){ tone(base*(.85+Math.random()*.4),.07,'triangle',.11); },
    scale(){ tone(2100,.02,'square',.035); },
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
    root.querySelector(".pack-world").appendChild(d);
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
function makeTimer(el, secs, onEnd){
  const fg = $('.ring-fg', el), num = $('.ring-num', el), L = 125.66;
  let left = secs, id = null, last = 0, lastWhole = secs;
  const draw = () => { num.textContent = Math.max(0, Math.ceil(left)); fg.style.strokeDashoffset = L * (1 - Math.max(0, left) / secs); el.classList.toggle('hurry', left <= 5 && left > 0); };
  draw();
  const api = {
    start(){ last = performance.now(); clearInterval(id); id = setInterval(() => {
      const n = performance.now(); left -= (n - last) / 1000; last = n;
      const w = Math.ceil(left); if (w !== lastWhole){ lastWhole = w; if (w <= 5 && w > 0) SFX.tick(); }
      draw(); if (left <= 0){ api.stop(); onEnd(); }
    }, 100); },
    stop(){ clearInterval(id); id = null; el.classList.remove('hurry'); }
  };
  return api;
}
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
const wordMs = w => 170 + w.length * 28 + (/[.,!?]$/.test(w) ? 230 : 0);
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
    for (let k = 0; k < syl; k++) setTimeout(() => { if (playing) SFX.blip(base); }, k * 75);
    idx++; timer = setTimeout(step, wordMs(w));
  }
  function play(){ SFX.unlock(); idx = 0; spans.forEach(s => s.classList.remove('on')); setBars(0); playing = true; host.classList.add('playing'); btn.innerHTML = ICON_PAUSE; btn.setAttribute('aria-label','Skip to the end'); step(); }
  btn.onclick = () => playing ? finish() : play();
  return { play, stop(){ if (playing){ clearTimeout(timer); playing = false; host.classList.remove('playing'); btn.innerHTML = ICON_PLAY; } } };
}
function shuffle(a){ a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- state ---------- */
const S = { look:{}, tab:'top', wear:{}, packed:[], flying:new Set(), locked:false, zipping:false, stats:null, bits:[] };
let wearTimer = null, packTimer = null, introVN = null, replyVN = null;

/* ---------- intro ---------- */
$('#cl1').innerHTML = svgItem('hoodie','matcha');
$('#cl2').innerHTML = svgItem('heels','blush');
$('#cl3').innerHTML = svgItem('perfume','yolk');
introVN = voiceNote($('#vnIntro'), {from:'Zain', text:ZAIN_INTRO, base:140});
$('#muteBtn').onclick = e => { SFX.muted = !SFX.muted; e.currentTarget.setAttribute('aria-pressed', SFX.muted); e.currentTarget.textContent = SFX.muted ? 'Sound off' : 'Sound on'; };
$('#startBtn').onclick = () => { SFX.unlock(); SFX.pop(); introVN.stop(); startWear(); };

/* ---------- phase 1: wear ---------- */
function startWear(){
  clearBits();
  S.look = {}; S.tab = 'top'; S.locked = false;
  SLOTS.forEach(s => S.wear[s] = shuffle(WEAR[s]));
  $$('.slot').forEach(sl => { sl.classList.remove('filled'); $('.slot-art', sl).innerHTML = ''; });
  renderTabs(); renderOptions(); $('#lockBtn').disabled = true;
  show('wear');
  wearTimer = makeTimer($('#wearTimer'), WEAR_SECS, () => { toast("Time. You're wearing what you picked."); lockLook(); });
  wearTimer.start();
}
function renderTabs(){
  $('#tabs').innerHTML = SLOTS.map(s => `<button type="button" role="tab" class="tab${S.tab===s?' on':''}${S.look[s]?' filled':''}" data-tab="${s}" aria-selected="${S.tab===s}">${LABEL[s]}</button>`).join('');
}
function renderOptions(){
  const cur = S.look[S.tab];
  $('#options').innerHTML = S.wear[S.tab].map(it => `<button type="button" class="card${cur && cur.id===it.id?' sel':''}" data-id="${it.id}" aria-pressed="${!!(cur && cur.id===it.id)}"><span class="art">${svgItem(it.type,it.color)}</span><span class="nm">${it.name}</span></button>`).join('');
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b || S.locked) return; S.tab = b.dataset.tab; SFX.tick(); renderTabs(); renderOptions(); });
$('#options').addEventListener('click', async e => {
  const card = e.target.closest('.card'); if (!card || S.locked) return;
  const slot = S.tab, it = S.wear[slot].find(x => x.id === card.dataset.id);
  const from = $('.art', card).getBoundingClientRect();
  SFX.pop();
  S.look[slot] = it;
  const slotEl = $(`.slot[data-slot="${slot}"]`), art = $('.slot-art', slotEl);
  const token = Symbol(); art._token = token;
  art.innerHTML = svgItem(it.type, it.color); art.style.visibility = 'hidden'; slotEl.classList.add('filled');
  const next = SLOTS.find(s => !S.look[s]); if (next) S.tab = next;
  renderTabs(); renderOptions();
  $('#lockBtn').disabled = !SLOTS.every(s => S.look[s]);
  SFX.whoosh();
  await fly(svgItem(it.type, it.color), from, art.getBoundingClientRect(), {spin: hash(it.id) * 40 - 20});
  if (art._token !== token) return;
  art.style.visibility = ''; art.classList.remove('land'); void art.offsetWidth; art.classList.add('land'); SFX.thud();
});
$('#lockBtn').onclick = () => lockLook();
async function lockLook(){
  if (S.locked) return; S.locked = true; wearTimer.stop();
  $$('.slot-art').forEach(a => a.style.visibility = '');
  SFX.ding(); const b = $('#board'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  await wait(750); startPack();
}

/* ---------- phase 2: pack ---------- */
function packStats(list){
  const cnt = c => list.filter(i => i.cat === c).length;
  const looks = Math.min(cnt('top'), cnt('bottom')) + cnt('full');
  return { looks, warm: list.some(i => i.warm), shoes: cnt('shoes'), weight: Math.round((CASE_KG + list.reduce((a, i) => a + i.w, 0)) * 10) / 10 };
}
function startPack(){
  S.packed = []; S.flying.clear(); S.zipping = false; S.order = shuffle(PACK);
  $('#case').classList.remove('zipped','strain');
  renderGrid(); renderCase(); renderGoals();
  show('pack');
  packTimer = makeTimer($('#packTimer'), PACK_SECS, () => { toast('Time. Zipping it as it is.'); zipIt(); });
  packTimer.start();
}
function renderGrid(){
  const ids = new Set(S.packed.map(i => i.id));
  $('#packGrid').innerHTML = S.order.map(it => `<button type="button" class="card${ids.has(it.id)?' packed':''}" data-id="${it.id}" aria-pressed="${ids.has(it.id)}"><span class="badge">In bag</span><span class="art">${svgItem(it.type,it.color)}</span><span class="nm">${it.name}</span></button>`).join('');
}
function casePos(i, id){
  const col = i % 5, row = Math.floor(i / 5);
  const jx = (hash(id + 'x') - .5) * .12, jy = (hash(id + 'y') - .5) * .2;
  let px = col / 4 + jx, py = row < 3 ? row / 2.2 + .05 + jy : hash(id + 'p');
  px = Math.min(1, Math.max(0, px)); py = Math.min(1, Math.max(0, py));
  return {px, py, r: Math.round((hash(id + 'r') - .5) * 50)};
}
function renderCase(){
  const n = S.packed.length;
  $('#caseInside').innerHTML = S.packed.map((it, i) => {
    const p = casePos(i, it.id);
    return `<button type="button" class="pk" data-id="${it.id}" aria-label="Take out ${it.name}" style="left:calc((100% - 54px) * ${p.px.toFixed(3)});top:calc((100% - 54px) * ${p.py.toFixed(3)});--r:${p.r}deg;z-index:${i+1};${S.flying.has(it.id)?'visibility:hidden':''}">${svgItem(it.type,it.color)}</button>`;
  }).join('') + (n ? '' : '<p class="case-empty">Tap clothes to throw them in. Tap them again to take them out.</p>');
  const c = $('#case'); c.style.setProperty('--bulge', (1 + Math.min(n, 19) * .005).toFixed(3)); c.classList.toggle('strain', n >= 12);
  $('#zipBtn').disabled = !n;
  $('#zipBtn').innerHTML = n ? `Zip it <small>${n} item${n>1?'s':''}</small>` : 'Zip it';
}
function renderGoals(){
  const st = packStats(S.packed);
  const g = [[`Looks ${Math.min(st.looks,3)}/3`, st.looks >= 3], ['Warm layer', st.warm], ['Spare shoes', st.shoes > 0]];
  $('#goals').innerHTML = g.map(([t, ok]) => `<span class="goal${ok?' done':''}"><i></i>${t}</span>`).join('');
}
function bumpCase(){ if (!REDUCE) $('.case-body').animate([{transform:'scale(1)'},{transform:'scale(1.05,.94)'},{transform:'scale(.98,1.03)'},{transform:'scale(1)'}], {duration:280}); }
$('#packGrid').addEventListener('click', e => { const card = e.target.closest('.card'); if (!card || S.zipping) return; const it = PACK.find(x => x.id === card.dataset.id); S.packed.some(p => p.id === it.id) ? unpack(it) : packItem(it, card); });
$('#caseInside').addEventListener('click', e => { const pk = e.target.closest('.pk'); if (!pk || S.zipping) return; unpack(PACK.find(x => x.id === pk.dataset.id)); });
async function packItem(it, card){
  const from = $('.art', card).getBoundingClientRect();
  S.packed.push(it); S.flying.add(it.id); SFX.pop();
  card.classList.add('packed'); card.setAttribute('aria-pressed','true');
  renderCase(); renderGoals();
  const target = $(`#caseInside [data-id="${it.id}"]`);
  SFX.whoosh();
  await fly(svgItem(it.type, it.color), from, target.getBoundingClientRect(), {spin: hash(it.id) * 120 - 60});
  S.flying.delete(it.id);
  const el = $(`#caseInside [data-id="${it.id}"]`); if (!el) return;
  el.style.visibility = ''; el.classList.add('land'); SFX.thud(); bumpCase();
}
function unpack(it){
  const pk = $(`#caseInside [data-id="${it.id}"]`), card = $(`#packGrid [data-id="${it.id}"]`);
  const from = pk && pk.getBoundingClientRect();
  S.packed = S.packed.filter(p => p.id !== it.id); S.flying.delete(it.id);
  SFX.pop(); renderCase(); renderGoals();
  if (card){ card.classList.remove('packed'); card.setAttribute('aria-pressed','false'); if (from) fly(svgItem(it.type, it.color), from, $('.art', card).getBoundingClientRect(), {dur:380}); }
}
$('#zipBtn').onclick = () => zipIt();
async function zipIt(){
  if (S.zipping) return; S.zipping = true; packTimer.stop();
  S.flying.clear(); $$('#caseInside .pk').forEach(p => p.style.visibility = '');
  SFX.zip(); $('#case').classList.add('zipped');
  await wait(800); startWeigh();
}

/* ---------- phase 3: weigh ---------- */
function countUp(el, to, ms){
  return new Promise(res => {
    const t0 = performance.now(); let lastT = -1; ms = REDUCE ? 1 : ms;
    const f = n => { const p = Math.min(1, (n - t0) / ms), v = to * (1 - Math.pow(1 - p, 3)); el.textContent = v.toFixed(1).padStart(4, '0');
      const k = Math.floor(v * 2); if (k !== lastT){ lastT = k; SFX.scale(); } p < 1 ? requestAnimationFrame(f) : res(); };
    requestAnimationFrame(f);
  });
}
function stamp(kind, big, small){ const s = $('#stamp'); s.className = 'stamp ' + kind; $('b', s).textContent = big; $('small', s).textContent = small; s.hidden = false; void s.offsetWidth; s.classList.add('in'); }
function clearBits(){ S.bits.forEach(b => b.remove()); S.bits = []; }
async function startWeigh(){
  const st = S.stats = packStats(S.packed);
  const bag = $('#bag'), ro = $('#readout');
  bag.className = 'bag'; ro.className = 'readout'; $('#stamp').hidden = true; $('#toResult').hidden = true; $('#kg').textContent = '00.0';
  bag.style.setProperty('--fat', (1 + Math.min(S.packed.length, 19) * .012).toFixed(3));
  show('weigh');
  $('#belt').classList.add('run');
  await (REDUCE ? Promise.resolve() : bag.animate([{transform:'translateY(-300px) rotate(-8deg)'},{transform:'translateY(0) rotate(0)'}], {duration:620, easing:'cubic-bezier(.34,1.56,.64,1)'}).finished);
  $('#belt').classList.remove('run');
  SFX.thud(); await wait(350);
  await countUp($('#kg'), st.weight, 1900);
  await wait(250);
  if (st.weight > LIMIT){
    ro.classList.add('over'); SFX.buzz(); bag.classList.add('strain');
    await wait(1200);
    SFX.crash(); bag.classList.remove('strain');
    const r = bag.getBoundingClientRect();
    bag.classList.add('topple');
    burstLid(r); burstItems(r);
    if (!REDUCE) $('#app').animate([{transform:'translate(0,0)'},{transform:'translate(-9px,5px)'},{transform:'translate(8px,-5px)'},{transform:'translate(-5px,3px)'},{transform:'translate(0,0)'}], {duration:420});
    stamp('bad', 'Overweight', `+${(st.weight - LIMIT).toFixed(1)} kg over the limit`);
  } else {
    ro.classList.add('ok'); SFX.ding();
    stamp('good', 'Checked in', `${(LIMIT - st.weight).toFixed(1)} kg to spare`);
    await wait(800);
    $('#belt').classList.add('run'); bag.classList.add('away');
    confetti();
    await wait(1200); $('#belt').classList.remove('run');
  }
  await wait(900);
  $('#toResult').hidden = false;
}
function burstLid(r){
  const d = document.createElement('div'); d.className = 'lid-fly';
  Object.assign(d.style, {left: r.left + 'px', top: r.top + 20 + 'px', width: r.width + 'px'});
  root.querySelector(".pack-world").appendChild(d); S.bits.push(d);
  d.animate([{transform:'translate(0,0) rotate(0)'},{transform:'translate(-90px,-260px) rotate(-210deg)', opacity:0}], {duration:950, easing:'cubic-bezier(.2,.8,.4,1)', fill:'forwards'});
}
function burstItems(r){
  const floor = $('#stage').getBoundingClientRect().bottom - 22;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, s = 58;
  const parts = S.packed.map(it => {
    const el = document.createElement('div'); el.className = 'bit'; el.innerHTML = svgItem(it.type, it.color);
    root.querySelector(".pack-world").appendChild(el); S.bits.push(el);
    return {el, s, x: cx - s/2, y: cy - s/2, vx: (Math.random()*2 - 1) * 9, vy: -(8 + Math.random() * 11), r: Math.random() * 60 - 30, vr: (Math.random()*2 - 1) * 16, g: .55};
  });
  physics(parts, {floor});
}
function confetti(){
  const cols = [COL.matcha, COL.blush, COL.yolk, COL.cream, COL.maroon];
  const parts = Array.from({length: REDUCE ? 0 : 46}, (_, i) => {
    const el = document.createElement('div'); el.className = 'conf';
    const w = 8 + Math.random() * 8, h = 5 + Math.random() * 6;
    Object.assign(el.style, {width: w + 'px', height: h + 'px', background: cols[i % cols.length]});
    root.querySelector(".pack-world").appendChild(el); S.bits.push(el);
    return {el, s: w, x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .45, vx: (Math.random() - .5) * 14, vy: -(9 + Math.random() * 12), r: Math.random() * 360, vr: (Math.random() - .5) * 30, g: .38};
  });
  physics(parts, {life: 3800});
  setTimeout(() => parts.forEach(p => p.el.remove()), 3900);
}
$('#toResult').onclick = () => { SFX.pop(); clearBits(); renderResult(); };

/* ---------- results ---------- */
function score(){
  const items = SLOTS.map(s => S.look[s]).filter(Boolean);
  const comfort = Math.round(items.reduce((a, i) => a + i.comfort, 0) / 40 * 30);
  const counts = {}; items.forEach(i => counts[i.color] = (counts[i.color] || 0) + 1);
  const max = items.length ? Math.max(...Object.values(counts)) : 0;
  const dom = Object.keys(counts).find(k => counts[k] === max);
  const tonal = {4:30, 3:21, 2:12, 1:4, 0:0}[max];
  const st = S.stats, over = st.weight > LIMIT;
  let pack = 0, roomPts = 0;
  if (!over){
    roomPts = st.weight <= ROOM_TARGET ? 15 : Math.round(15 * (LIMIT - st.weight) / (LIMIT - ROOM_TARGET));
    pack = Math.min(st.looks, 3) * 5 + (st.warm ? 5 : 0) + (st.shoes ? 5 : 0) + roomPts;
  }
  return {items, comfort, max, dom, tonal, st, over, pack, total: comfort + tonal + pack};
}
function renderResult(){
  const r = score(), st = r.st;
  let grade, sub;
  if (r.over){ grade = 'Excess Baggage'; sub = 'The suitcase gave up before you did.'; }
  else if (r.total >= 85){ grade = 'Carry-On Icon'; sub = 'Light bag, sharp look, room to shop.'; }
  else if (r.total >= 65){ grade = 'First Class Energy'; sub = 'Polished, comfy, almost perfect.'; }
  else if (r.total >= 45){ grade = 'Gate Change Panic'; sub = 'You made the flight. Just about.'; }
  else { grade = 'Missed Boarding'; sub = 'Zain is already sighing.'; }
  finalResult = {finalScore:r.total, grade, comfortScore:r.comfort, monochromeScore:r.tonal, bagWeight:st.weight, overweight:r.over};
  onResult(finalResult);
  $('#grade').textContent = grade; $('#gradeSub').textContent = sub;

  const comfortNote = r.comfort >= 24 ? 'Seven hours in 34A, zero regrets.' : r.comfort >= 15 ? 'Fine until hour three.' : 'Heels at the airport. Brave.';
  const nm = COLNAME[r.dom] || '';
  const tonalNote = {4:`Full monochrome. ${nm}, head to toe.`, 3:`Nearly tonal. One piece broke the ${nm.toLowerCase()} streak.`, 2:'Two-tone. Safe, a little busy.', 1:'Colour clash. Bold for a 6 a.m. check-in.', 0:'No look picked.'}[r.max];
  const swatches = r.items.map(i => `<i style="background:${COL[i.color]}"></i>`).join('');
  const room = (LIMIT - st.weight).toFixed(1);
  const packNote = r.over
    ? `Bag ${st.weight.toFixed(1)} of ${LIMIT}.0 kg. Overweight by ${(st.weight - LIMIT).toFixed(1)} kg, so the packing score is zero.`
    : `Bag ${st.weight.toFixed(1)} of ${LIMIT}.0 kg. ${Math.min(st.looks,3)} of 3 looks, ${st.warm ? 'warm layer packed' : 'no coat for London'}, ${st.shoes ? 'spare shoes in' : 'no spare shoes'}, ${room} kg free for shopping.`;
  const rows = [
    {label:'Comfort', pts:r.comfort, max:30, note:comfortNote},
    {label:'Monochrome', pts:r.tonal, max:30, note:tonalNote, extra:`<span class="swatches">${swatches}</span>`},
    {label:'Packing', pts:r.pack, max:40, note:packNote, bad:r.over},
  ];
  $('#rows').innerHTML = rows.map(x => `<div class="row${x.bad?' bad':''}"><div class="row-top"><span>${x.label}</span>${x.extra||''}<b>${x.pts}<small>/${x.max}</small></b></div><div class="bar"><i data-w="${x.bad ? 1 : x.pts / x.max}"></i></div><p>${x.note}</p></div>`).join('');
  const heavy = S.packed.slice().sort((a, b) => b.w - a.w)[0];
  $('#heavy').textContent = heavy ? `Heaviest thing you packed: ${heavy.name}, ${heavy.w.toFixed(1)} kg. Empty suitcase: ${CASE_KG} kg.` : '';

  const reply = r.over
    ? 'Shoug. The bag exploded at the check-in desk. In front of everyone. I said do not overpack. Wallah, I said it.'
    : st.weight <= ROOM_TARGET
      ? 'Okay, I see you. Light bag, plenty of room. We are shopping until they close the mall.'
      : 'It closed. Barely. Shoug, where are the shopping bags going to go? On your head?';
  replyVN = voiceNote($('#vnReply'), {from:'Zain', text:reply, base:140});
  show('result');
  requestAnimationFrame(() => requestAnimationFrame(() => $$('#rows .bar i').forEach(i => i.style.width = (Math.max(0, +i.dataset.w) * 100) + '%')));
  const el = $('#scoreNum'), t0 = performance.now(), dur = REDUCE ? 1 : 1200;
  const f = n => { const p = Math.min(1, (n - t0) / dur); el.textContent = Math.round(r.total * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); else { if (!r.over && r.total >= 65) SFX.ding(); } };
  requestAnimationFrame(f);
  setTimeout(() => replyVN.play(), REDUCE ? 50 : 1500);
}
$('#againBtn').onclick = async () => { const btn = $('#againBtn'); if(btn.disabled) return; SFX.pop(); if(replyVN) replyVN.stop(); btn.disabled = true; try { await onContinue(finalResult); } catch(e) { btn.disabled = false; toast('Could not continue. Please try again.'); } };

  return () => { disposed = true; timeouts.forEach(window.clearTimeout); intervals.forEach(window.clearInterval); frames.forEach(window.cancelAnimationFrame); root.querySelectorAll('*').forEach(el=>el.getAnimations?.().forEach(a=>a.cancel())); SFX.close(); root.replaceChildren(); };
}
