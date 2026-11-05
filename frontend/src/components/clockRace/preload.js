// Image preloading for Clock Race.
// The round's tasks arrive with the round, so the client already knows which pictures the next few
// challenges use; nothing here asks the server for anything new (no answers are revealed).
//
// - The current challenge's pictures load first (high priority), then the next three challenges'.
// - At most MAX_ACTIVE downloads at once, so slow connections aren't swamped.
// - Every picture is fetched once and the decoded Image is kept, so the <img> on screen reuses it.
// - When the player moves on, pictures that are no longer wanted and haven't started are dropped.
import {artUrl, photoUrl, priceUrl, tileUrls} from './assetUrls';
const MAX_ACTIVE = 3;
const LOOKAHEAD = 3;

const cache = new Map();   // url -> {img, state: 'loading'|'ready'|'error', waiters:Set<fn>}
let wanted = [];           // urls in priority order, not started yet
let active = 0;

/** The picture urls a task shows. */
export function taskImages(task) {
  if (!task) return [];
  if (task.type === 'photo' && task.pic) return [photoUrl(task.pic)];
  if (task.type === 'price') return task.options.map(priceUrl);
  if (task.type === 'tile' && (task.pic || task.img)) return tileUrls(task);
  if (Array.isArray(task.options)) {
    return task.options.filter(Array.isArray).map(o => o[0]).filter(k => typeof k === 'string').map(artUrl).filter(Boolean);
  }
  return [];
}

export const isReady = url => cache.get(url)?.state === 'ready';

/** Call fn once the url has loaded (or failed); returns an unsubscribe. */
export function whenReady(url, fn) {
  const entry = cache.get(url);
  if (entry && entry.state !== 'loading') { fn(); return () => {}; }
  if (!entry) start(url, true);
  const e = cache.get(url);
  e.waiters.add(fn);
  return () => e.waiters.delete(fn);
}

function start(url, urgent) {
  if (cache.has(url) || typeof Image === 'undefined') return;
  const img = new Image();
  const entry = {img, state: 'loading', waiters: new Set()};
  cache.set(url, entry);
  active += 1;
  try { img.fetchPriority = urgent ? 'high' : 'low'; } catch { /* older browsers */ }
  img.decoding = 'async';
  const done = state => {
    if (entry.state !== 'loading') return;
    entry.state = state;
    active -= 1;
    entry.waiters.forEach(fn => fn());
    entry.waiters.clear();
    if (state === 'error') cache.delete(url); // a later visit may retry
    pump();
  };
  img.onload = () => {
    // decode before showing, so the picture appears whole instead of painting in
    if (img.decode) img.decode().then(() => done('ready'), () => done('ready'));
    else done('ready');
  };
  img.onerror = () => done('error');
  img.src = url;
}

function pump() {
  while (active < MAX_ACTIVE && wanted.length) start(wanted.shift(), false);
}

/**
 * Tell the preloader where the player is. `tasks` is the round, `pos` the current task.
 * Current pictures start at once (they bypass the queue); the next three tasks' pictures queue behind them.
 */
export function preloadFrom(tasks, pos) {
  if (!Array.isArray(tasks)) return;
  taskImages(tasks[pos]).forEach(url => start(url, true));
  const next = [];
  for (let i = pos + 1; i <= pos + LOOKAHEAD && i < tasks.length; i++) next.push(...taskImages(tasks[i]));
  // drop queued pictures the player has moved past; keep order = soonest first
  wanted = next.filter((u, i, a) => a.indexOf(u) === i && !cache.has(u));
  pump();
}
