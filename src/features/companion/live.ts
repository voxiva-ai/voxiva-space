/** Tracks whether the phone companion server is running — avoids IPC on every PTY chunk. */
let companionLive = false;

export function setCompanionLive(live: boolean) {
  companionLive = live;
}

export function isCompanionLive() {
  return companionLive;
}
