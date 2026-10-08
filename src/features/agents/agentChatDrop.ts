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

/** Whole agent pane accepts file drops into the prompt (cmux-style). */
export function isAgentChatDropPoint(shell: HTMLElement | null | undefined): boolean {
  return !!shell?.classList.contains("is-agentChat");
}

/** Drop landed on an agent chat pane (or chat chrome was visible on release). */
export function isAgentChatDropRelease(shell: HTMLElement | null | undefined): boolean {
  if (!shell) return false;
  if (isAgentChatDropPoint(shell)) return true;
  return shell.classList.contains("is-dropChat");
}

/** No-op kept for callers that previously cleared band sticky state. */
export function resetAgentChatDropSticky(_shell?: HTMLElement | null) {
  // Chat band sticky was removed — whole pane is the drop target.
}

/** Agent terminal under the pointer (attach zone = entire shell). */
export function agentChatShellAtPoint(clientX: number, clientY: number): HTMLElement | null {
  return agentShellFromPoint(clientX, clientY);
}

/** @deprecated Body vs chat band no longer split — always null. */
export function agentPaneBodyShellAtPoint(
  _clientX: number,
  _clientY: number,
): HTMLElement | null {
  return null;
}

/** Find the agent chat shell inside a pane. */
export function agentChatShellInPane(paneEl: HTMLElement): HTMLElement | null {
  return paneEl.querySelector("[data-term-drop].is-agentChat") as HTMLElement | null;
}
