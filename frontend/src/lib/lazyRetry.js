import { lazy } from "react";

// React.lazy that survives a flaky connection: a failed download of a screen's code is retried twice
// (0.7s, then 2s) before the error reaches the error boundary. Without this, one dropped request on a
// phone left the page blank.
export function lazyRetry(load) {
  return lazy(async () => {
    let last;
    for (const wait of [0, 700, 2000]) {
      if (wait) await new Promise(r => setTimeout(r, wait));
      try { return await load(); } catch (err) { last = err; }
    }
    throw last;
  });
}
