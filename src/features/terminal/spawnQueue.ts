/**
 * Bound parallel PTY creates. Full serialization made multi-pane grids look stuck
 * on “Starting…” while only one ConPTY advanced. A small concurrency pool keeps
 * the UI responsive without a thundering herd on Windows.
 */
const MAX_PARALLEL = 4;

let inFlight = 0;
const waiters: Array<() => void> = [];

function pump() {
  while (inFlight < MAX_PARALLEL && waiters.length > 0) {
    const next = waiters.shift();
    if (!next) return;
    inFlight += 1;
    next();
  }
}

export function enqueueTerminalSpawn<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      void (async () => {
        try {
          await yieldToUi(0);
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          inFlight = Math.max(0, inFlight - 1);
          pump();
        }
      })();
    };
    waiters.push(start);
    pump();
  });
}

export function yieldToUi(ms = 0) {
  if (ms <= 0) {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Stagger xterm mounts across a cold-start burst — keep short so panes feel parallel. */
let xtermMountSlot = 0;
let xtermBurstUntil = 0;

export function nextXtermMountDelay() {
  const now = Date.now();
  if (now > xtermBurstUntil) {
    xtermMountSlot = 0;
    xtermBurstUntil = now + 10_000;
  }
  const slot = xtermMountSlot++;
  if (slot === 0) return 0;
  return Math.min(180, slot * 35);
}

/** Ordered cold-start slots so every pane still boots, without a thundering herd. */
let coldStartIndex = 0;
let coldStartEpoch = 0;

export function takeColdStartSlot(priority: boolean) {
  const now = Date.now();
  if (now - coldStartEpoch > 12_000) {
    coldStartIndex = 0;
    coldStartEpoch = now;
  }
  if (priority) return 0;
  coldStartIndex += 1;
  return coldStartIndex;
}

/** Delay before a pane may request its first PTY. */
export function coldStartDelayMs(slot: number) {
  if (slot <= 0) return 0;
  return 20 + (slot - 1) * 40;
}
