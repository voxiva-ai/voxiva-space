/** Serialize PTY creates so opening a grid doesn't freeze the UI. */
let tail: Promise<unknown> = Promise.resolve();

/** Gap between ConPTY creates — Windows shells are expensive. */
const SPAWN_GAP_MS = 240;

export function enqueueTerminalSpawn<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(
    async () => {
      await yieldToUi(SPAWN_GAP_MS);
      return fn();
    },
    async () => {
      await yieldToUi(SPAWN_GAP_MS);
      return fn();
    },
  );
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
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

/** Stagger xterm mounts across a cold-start burst. */
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
  // ~120–960ms — keeps the focused pane instant, others after paint.
  return Math.min(960, slot * 120);
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
  // Focused = 0; others: 350, 700, 1050, … so UI stays interactive.
  return 350 + (slot - 1) * 350;
}
