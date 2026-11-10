import {useEffect, useState} from 'react';
import {BACKEND_URL} from '@/lib/api';

// Player avatars: 20 numbered picture slots, uploaded and replaced at /admin/plot-twist-avatars.
// The server gives every player one slot when they join and keeps it for the whole room, so every
// phone shows the same face for the same player. A slot without a picture shows the player's
// initial on that slot's colour.
export const AVATAR_COUNT = 20;

const TINTS = [
  ['#dab1b5', '#71405a'], ['#b8c1bd', '#3b5a64'], ['#dcc0a0', '#835d39'], ['#bdb2cc', '#65517a'],
  ['#f2c4a8', '#8a4b2f'], ['#c9d6b0', '#4e6131'], ['#f5d58f', '#7a5717'], ['#e7b3cf', '#7b2e5a'],
  ['#a9c9d6', '#2d5566'], ['#d7c2e8', '#5a3d7a'],
];
export const avatarTint = slot => TINTS[(Math.max(1, slot || 1) - 1) % TINTS.length];

let slots = null, pending = null;

// The slot list is fetched once per page load and shared by every avatar on the screen.
export function loadAvatars() {
  if (slots) return Promise.resolve(slots);
  if (!BACKEND_URL || typeof fetch !== 'function') return Promise.resolve([]);
  if (!pending) {
    pending = fetch(`${BACKEND_URL}/api/plot-twist/avatars`, {cache: 'no-cache'})
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => (slots = Array.isArray(d?.slots) ? d.slots : []))
      .catch(() => { pending = null; return []; });
  }
  return pending;
}

export function useAvatars() {
  const [list, setList] = useState(slots || []);
  useEffect(() => {
    let live = true;
    loadAvatars().then(s => { if (live) setList(s); });
    return () => { live = false; };
  }, []);
  return list;
}

export const avatarSrc = (list, slot) => {
  const id = list?.[(slot || 0) - 1];
  return id && BACKEND_URL ? `${BACKEND_URL}/api/plot-twist/avatars/${id}.webp` : null;
};
