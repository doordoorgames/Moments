// Ink and highlight choices for each player's lines. Keep ids in sync with INKS and
// HIGHLIGHTS in backend/plot_twist.py. Only colours change; the font never does.
export const INK = {plum:'#4a2346', berry:'#8e1f4f', rose:'#c2416b', teal:'#1f6f73', forest:'#2f6b3a', navy:'#23396e', cocoa:'#6b4226', violet:'#5b3a9a'};
export const MARK = {none:'transparent', butter:'#ffe58a', blush:'#ffc9d6', mint:'#c6f0d8', lilac:'#e2d2ff', sky:'#cfe6ff', peach:'#ffd6b5', coral:'#ffb3a1'};
export const INKS = Object.keys(INK);
export const HIGHLIGHTS = Object.keys(MARK);
export const inkColor = id => INK[id] || INK.plum;
export const markColor = id => MARK[id] || 'transparent';
