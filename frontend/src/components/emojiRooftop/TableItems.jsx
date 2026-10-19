import React, {memo} from 'react';

// Seven party foods; one appears on the table each round. Flat shapes, hard ink outlines.
const INK = '#1a1026';
const S = {stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round'};

function Wings() {
  return <svg viewBox="0 0 100 80"><g {...S}>
    <path d="M28 40c-4-12 6-20 14-14l6 6c4-6 14-4 12 6-8 2-14 6-18 10" fill="#d9772f"/>
    <path d="M52 38c0-12 12-16 18-9l3 6c6-3 13 2 9 9-9-1-17 2-22 6" fill="#c2611f"/>
    <path d="M38 34c4-4 10-4 12 0" fill="none" stroke="#f3a55a"/>
    <path d="M8 42h84c-2 20-18 30-42 30S10 62 8 42z" fill="#7a3fa6"/>
    <path d="M8 42h84" fill="none"/><path d="M20 56c10 6 50 6 60 0" fill="none" stroke="#b07ad6"/>
  </g></svg>;
}
function Popcorn() {
  return <svg viewBox="0 0 80 100"><g {...S}>
    {[[22,30,11],[38,22,12],[54,30,11],[30,16,9],[48,14,9],[40,34,10]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill={i%2?'#fff1c4':'#ffe08a'}/>)}
    <path d="M12 36h56l-8 58H20z" fill="#fff4e3"/>
    <path d="M24 36l3 58M40 36v58M56 36l-3 58" stroke="#e0435c" strokeWidth="7"/>
    <path d="M12 36h56l-8 58H20z" fill="none"/>
  </g></svg>;
}
function Soda() {
  return <svg viewBox="0 0 60 100"><g {...S}>
    <rect x="12" y="14" width="36" height="78" rx="7" fill="#8a4fd0"/>
    <path d="M12 44h36v18H12z" fill="#ffb347"/>
    <path d="M16 14c0-6 4-8 14-8s14 2 14 8" fill="#d8d0e6"/>
    <path d="M26 8h10" stroke={INK}/><circle cx="30" cy="53" r="5" fill="#fff4e3"/>
  </g></svg>;
}
function Pizza() {
  return <svg viewBox="0 0 100 90"><g {...S}>
    <path d="M10 14c26-10 54-10 80 0L52 84z" fill="#ffc94d"/>
    <path d="M8 12c28-12 56-12 84 0l-3 9c-26-10-52-10-78 0z" fill="#c9792f"/>
    {[[34,32],[60,30],[48,52]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="7" fill="#d83a4f"/>)}
  </g></svg>;
}
function Fries() {
  return <svg viewBox="0 0 80 100"><g {...S}>
    {[[22,10],[32,4],[42,8],[52,2],[60,12],[28,18],[48,16]].map(([x,y],i)=><rect key={i} x={x} y={y} width="8" height="46" rx="2" fill={i%2?'#ffd45c':'#ffe48a'} transform={`rotate(${(i-3)*4} ${x+4} 50)`}/>)}
    <path d="M14 42h52l-6 52H20z" fill="#e0435c"/>
    <path d="M22 42c4 10 32 10 36 0" fill="none" stroke="#fff4e3"/>
  </g></svg>;
}
function Donut() {
  return <svg viewBox="0 0 100 80"><g {...S}>
    <ellipse cx="50" cy="44" rx="40" ry="28" fill="#d9924a"/>
    <path d="M14 40c2-14 18-24 36-24s34 10 36 24c-4 8-10 4-14 10-6-4-10 4-16 0-6 6-12-2-18 2-6-6-12 0-16-6-4 2-6-2-8-6z" fill="#ff8fbf"/>
    <ellipse cx="50" cy="40" rx="11" ry="7" fill="#3a1f5c"/>
    {[[30,30,'#fff4e3'],[66,28,'#ffd45c'],[36,48,'#8ad0ff'],[62,48,'#fff4e3'],[48,24,'#8ad0ff']].map(([x,y,c],i)=><path key={i} d={`M${x} ${y}l5 -2`} stroke={c} strokeWidth="3"/>)}
  </g></svg>;
}
function Lemonade() {
  return <svg viewBox="0 0 70 100"><g {...S}>
    <path d="M44 4l-6 40" stroke="#ff8fbf" strokeWidth="5"/>
    <path d="M14 24h42l-6 70H20z" fill="#fff4e3"/>
    <path d="M16 38h38l-5 54H21z" fill="#ffe066"/>
    <circle cx="54" cy="26" r="11" fill="#ffd23f"/><path d="M54 18v16M46 26h16" stroke="#fff4e3" strokeWidth="2"/>
    <rect x="24" y="48" width="9" height="9" rx="2" fill="#fff4e3" opacity=".8"/><rect x="36" y="60" width="8" height="8" rx="2" fill="#fff4e3" opacity=".8"/>
  </g></svg>;
}

export const ITEMS = [Wings, Popcorn, Soda, Pizza, Fries, Donut, Lemonade];

export const TableItem = memo(function TableItem({index}) {
  const Item = ITEMS[((index % ITEMS.length) + ITEMS.length) % ITEMS.length];
  return <Item/>;
});

export const CatTail = memo(function CatTail() {
  return <svg className="er-tail" viewBox="0 0 60 120" aria-hidden="true"><g stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M30 118C26 90 14 70 18 44c4-22 22-30 30-20 6 8-2 16-8 12" fill="none" stroke={INK} strokeWidth="17"/>
    <path d="M30 118C26 90 14 70 18 44c4-22 22-30 30-20 6 8-2 16-8 12" fill="none" stroke="#f0a24f" strokeWidth="11"/>
    <path d="M22 78l7-3M19 58l8-2M24 38l7 2" stroke="#c9692a" strokeWidth="4"/>
  </g></svg>;
});
