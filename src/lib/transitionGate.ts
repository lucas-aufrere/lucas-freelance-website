// Lightweight asset-readiness signal consumed by TransitionProvider.
//
// Heavy routes (the WebGL rotonde, future canvas sequences…) call
// `register()` as soon as they mount and `release()` once their assets
// are decoded AND the first frame has actually painted. The page
// transition holds its cover phase until every outstanding hold has
// been released — so the curtain lifts onto a fully-rendered scene
// rather than a flash of empty canvas.
//
// `waitForReady(maxMs)` always resolves: if a release never comes
// (network failure, missing asset, etc.), the timeout caps the wait
// so the user never sees a stuck curtain.

let pending = 0;
const releases = new Set<() => void>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function register(): () => void {
  pending += 1;
  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    releases.delete(release);
    pending = Math.max(0, pending - 1);
    if (pending === 0) notify();
  };
  releases.add(release);
  return release;
}

// Drains every outstanding hold. Used by readiness emitters that live
// inside the React Three Fiber canvas — context doesn't cross the R3F
// tree boundary, so the simplest reliable signal is "anything pending,
// you can lift now."
export function releaseAll(): void {
  for (const release of Array.from(releases)) release();
}

export function isReady(): boolean {
  return pending === 0;
}

export function waitForReady(maxMs: number): Promise<void> {
  if (pending === 0) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      listeners.delete(onChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onChange = (): void => {
      if (pending === 0) finish();
    };
    listeners.add(onChange);
    const timer = window.setTimeout(finish, maxMs);
  });
}
