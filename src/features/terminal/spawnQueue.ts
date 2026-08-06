/** Serialize PTY creates so opening a grid doesn't freeze the UI. */
let tail: Promise<unknown> = Promise.resolve();

export function enqueueTerminalSpawn<T>(fn: () => Promise<T>): Promise<T> {
  const run = tail.then(
    () => fn(),
    () => fn(),
  );
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function yieldToUi(ms = 80) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Stagger xterm mounts so 4–8 panes don't jank the main thread. */
let xtermMountSlot = 0;

export function nextXtermMountDelay() {
  const slot = xtermMountSlot++ % 8;
  return 40 + slot * 90;
}
