import {TV_IDS} from './screens';

// Which TV sits where. Picked once when a session or room starts, then locked:
// NEXT only ever changes the letters.

export const validArrangement = a => Array.isArray(a) && a.length === TV_IDS.length
  && TV_IDS.every(id => a.includes(id));

const same = (a, b) => validArrangement(b) && a.every((id, i) => id === b[i]);

export function shuffleArrangement(previous = null, random = Math.random) {
  for (let tries = 0; tries < 20; tries++) {
    const a = [...TV_IDS];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (!same(a, previous)) return a;
  }
  return [...TV_IDS];
}

// Stable arrangement for a room whose server predates arrangements: every phone in the room
// derives the same order from the room code.
export function seededArrangement(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const random = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909); return ((h >>> 0) % 100000) / 100000; };
  return shuffleArrangement(null, random);
}

const LOCAL_KEY = 'letter-tv-local-tvs';   // this tab's local session (survives refresh)
const LAST_KEY = 'letter-tv-last-tvs';     // most recent arrangement anywhere, to avoid repeats

const read = (store, k) => { try { const v = JSON.parse(store.getItem(k) || 'null'); return validArrangement(v) ? v : null; } catch { return null; } };
const write = (store, k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

// Local play: one arrangement per browser-tab session. Refresh keeps it; a new tab starts fresh.
export function localArrangement() {
  const saved = read(window.sessionStorage, LOCAL_KEY);
  if (saved) return saved;
  const fresh = shuffleArrangement(read(window.localStorage, LAST_KEY));
  write(window.sessionStorage, LOCAL_KEY, fresh);
  write(window.localStorage, LAST_KEY, fresh);
  return fresh;
}

export function rememberArrangement(a) {
  if (validArrangement(a)) write(window.localStorage, LAST_KEY, a);
}
