/** Bottom band of the xterm host — OpenCode / Gemini prompt + hints area. */
const CHAT_ENTER_RATIO = 0.58;
const CHAT_LEAVE_RATIO = 0.5;
const CHAT_ENTER_MIN_PX = 152;
const CHAT_LEAVE_MIN_PX = 128;

/** Resolve the live xterm host inside a terminal shell. */
function xtermHost(shell: HTMLElement): HTMLElement | null {
  return shell.querySelector(".vs-xtermHost");
}

function hostRect(shell: HTMLElement): DOMRect | null {
  const host = xtermHost(shell);
  const rect = (host ?? shell).getBoundingClientRect();
  return rect.height > 0 ? rect : null;
}

const chatSticky = new WeakMap<HTMLElement, boolean>();

function chatBandPx(shell: HTMLElement, mode: "enter" | "leave") {
  const rect = hostRect(shell);
  if (!rect) {
    return mode === "enter" ? CHAT_ENTER_MIN_PX : CHAT_LEAVE_MIN_PX;
  }
  const ratio = mode === "enter" ? CHAT_ENTER_RATIO : CHAT_LEAVE_RATIO;
  const min = mode === "enter" ? CHAT_ENTER_MIN_PX : CHAT_LEAVE_MIN_PX;
  return Math.max(min, rect.height * ratio);
}

/** Find agent terminal shell under pointer (xterm canvas-safe). */
export function agentShellFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : ([document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[]);
  for (const el of stack) {
    const shell = (el as Element).closest?.("[data-term-drop].is-agentChat") as HTMLElement | null;
    if (shell) return shell;
  }
  return null;
}

/** True when the pointer is over the agent chat-input band (bottom of the terminal). */
export function isAgentChatDropPoint(
  shell: HTMLElement | null | undefined,
  clientY: number,
): boolean {
  if (!shell?.classList.contains("is-agentChat")) return false;
  const rect = hostRect(shell);
  if (!rect) return false;
  const fromBottom = rect.bottom - clientY;
  const sticky = chatSticky.get(shell) ?? false;
  if (sticky) {
    if (fromBottom > chatBandPx(shell, "leave")) {
      chatSticky.set(shell, false);
      return false;
    }
    return true;
  }
  if (fromBottom <= chatBandPx(shell, "enter")) {
    chatSticky.set(shell, true);
    return true;
  }
  return false;
}

/** Drop landed in chat if pointer is in band OR chat chrome was visible on release. */
export function isAgentChatDropRelease(
  shell: HTMLElement | null | undefined,
  clientY: number,
): boolean {
  if (!shell) return false;
  if (isAgentChatDropPoint(shell, clientY)) return true;
  return shell.classList.contains("is-dropChat");
}

export function resetAgentChatDropSticky(shell?: HTMLElement | null) {
  if (shell) {
    chatSticky.delete(shell);
    return;
  }
  // WeakMap has no clear — sticky resets per shell on leave/drop via delete above.
}

/** Agent terminal shell under the pointer, only when in the chat band. */
export function agentChatShellAtPoint(clientX: number, clientY: number): HTMLElement | null {
  const shell = agentShellFromPoint(clientX, clientY);
  if (!shell || !isAgentChatDropPoint(shell, clientY)) return null;
  return shell;
}

/** Agent terminal shell under the pointer, outside the chat band. */
export function agentPaneBodyShellAtPoint(
  clientX: number,
  clientY: number,
): HTMLElement | null {
  const shell = agentShellFromPoint(clientX, clientY);
  if (!shell || isAgentChatDropPoint(shell, clientY)) return null;
  return shell;
}

/** Find the agent chat shell inside a pane (for drop paint when pointer is in chat band). */
export function agentChatShellInPane(paneEl: HTMLElement): HTMLElement | null {
  return paneEl.querySelector("[data-term-drop].is-agentChat") as HTMLElement | null;
}
