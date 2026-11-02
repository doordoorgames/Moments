// New deployments are picked up without yanking players out of a game.
// Before: any new build (checked every minute, on focus, on service-worker takeover) reloaded the page
// at once, even mid-race, which showed up as "the site refreshed by itself" and, while the new build
// was still rolling out, sometimes a blank page. Now an update is only noted; the reload happens the
// next time the player is somewhere safe (a page that is not a live game room or mini-game).

let pending = false;
let reloading = false;

/** True while the player is inside a game, where a reload would interrupt them. */
export function inGame(path = window.location.pathname) {
  return /\/room\//.test(path) || path.startsWith('/mini-games/') || path.startsWith('/play') || path.startsWith('/shoug-2');
}

function reloadNow() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

/** A newer build is live: reload now if that's harmless, otherwise wait for a safe moment. */
export function requestReload() {
  if (inGame()) { pending = true; return; }
  reloadNow();
}

/** Called on every route change: applies a waiting update once the player has left the game. */
export function applyPendingUpdate(path) {
  if (pending && !inGame(path)) reloadNow();
}

export const updatePending = () => pending;
