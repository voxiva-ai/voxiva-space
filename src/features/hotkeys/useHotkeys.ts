import { useEffect, useState } from "react";
import { useSpace } from "@/features/workspace/SpaceContext";
import { collectLeaves } from "@/features/workspace/layout";
import {
  DEFAULT_HOTKEYS,
  eventMatchesBinding,
  loadHotkeys,
  type HotkeyBinding,
  type HotkeyMap,
} from "./bindings";

function inTerminalFocus(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.classList.contains("xterm-helper-textarea") ||
      target.closest(".xterm") ||
      target.closest(".vs-xtermHost") ||
      target.closest(".vs-terminalShell"),
  );
}

function inPlainInput(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (inTerminalFocus(target)) return false;
  const tag = target.tagName;
  return tag === "TEXTAREA" || tag === "INPUT" || target.isContentEditable;
}

function match(event: KeyboardEvent, binding: HotkeyBinding, allowInTerminal: boolean) {
  if (!eventMatchesBinding(event, binding)) return false;
  if (inTerminalFocus(event.target) && !allowInTerminal) return false;
  // Chorded shortcuts may run inside the terminal (cmux-style).
  if (inTerminalFocus(event.target) && !(binding.alt || binding.ctrl)) return false;
  return true;
}

/** App shortcuts — Alt/Ctrl chords also work while a terminal is focused. */
export function useHotkeys() {
  const {
    setView,
    spawnInFocused,
    splitFocused,
    closeFocusedPane,
    workspaces,
    activeWorkspace,
    selectWorkspace,
    focusPane,
    isBusy,
  } = useSpace();
  const [bindings, setBindings] = useState<HotkeyMap>(() => loadHotkeys());

  useEffect(() => {
    const sync = () => setBindings(loadHotkeys());
    window.addEventListener("voxiva-hotkeys-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("voxiva-hotkeys-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (inPlainInput(event.target)) return;

      const go = (binding: HotkeyBinding) => match(event, binding, true);

      if (go(bindings.newTerminal)) {
        event.preventDefault();
        if (!isBusy) void spawnInFocused({ title: "Shell", accent: "green" });
        return;
      }
      if (go(bindings.closePane)) {
        event.preventDefault();
        void closeFocusedPane();
        return;
      }
      if (go(bindings.splitRight)) {
        event.preventDefault();
        void splitFocused("h");
        return;
      }
      if (go(bindings.splitDown)) {
        event.preventDefault();
        void splitFocused("v");
        return;
      }
      if (go(bindings.nextPane) || go(bindings.prevPane)) {
        if (!activeWorkspace) return;
        event.preventDefault();
        const leaves = collectLeaves(activeWorkspace.layout);
        if (leaves.length < 2) return;
        const idx = leaves.findIndex((l) => l.paneId === activeWorkspace.focusedPaneId);
        const delta = go(bindings.nextPane) ? 1 : -1;
        const next = leaves[(idx + delta + leaves.length) % leaves.length];
        if (next) focusPane(next.paneId);
        return;
      }
      if (go(bindings.nextWorkspace) || go(bindings.prevWorkspace)) {
        if (workspaces.length < 2) return;
        event.preventDefault();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspace?.id);
        const delta = go(bindings.nextWorkspace) ? 1 : -1;
        const next = workspaces[(Math.max(0, idx) + delta + workspaces.length) % workspaces.length];
        if (next) selectWorkspace(next.id);
        return;
      }
      if (go(bindings.viewSpace)) {
        event.preventDefault();
        setView("space");
        return;
      }
      if (go(bindings.viewAgents)) {
        event.preventDefault();
        setView("agents");
        return;
      }
      if (go(bindings.viewBoard)) {
        event.preventDefault();
        setView("board");
        return;
      }
      if (go(bindings.viewEditor)) {
        event.preventDefault();
        setView("editor");
        return;
      }
      if (go(bindings.viewProjects)) {
        event.preventDefault();
        setView("projects");
        return;
      }
      if (go(bindings.history)) {
        event.preventDefault();
        setView("history");
        return;
      }
      if (go(bindings.browser)) {
        event.preventDefault();
        setView("browser");
        return;
      }
      if (go(bindings.settings)) {
        event.preventDefault();
        setView("settings");
        return;
      }
      if (go(bindings.sidebar)) {
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.altKey || event.ctrlKey || event.metaKey) && /^[1-9]$/.test(key) && !event.shiftKey) {
        const ws = workspaces[Number(key) - 1];
        if (ws) {
          event.preventDefault();
          selectWorkspace(ws.id);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    bindings,
    setView,
    spawnInFocused,
    splitFocused,
    closeFocusedPane,
    workspaces,
    activeWorkspace,
    selectWorkspace,
    focusPane,
    isBusy,
  ]);

  return { bindings, defaults: DEFAULT_HOTKEYS };
}
