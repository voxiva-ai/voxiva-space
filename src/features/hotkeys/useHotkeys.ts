import { useEffect, useState } from "react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { collectLeaves } from "@/features/workspace/layout";
import {
  DEFAULT_HOTKEYS,
  eventMatchesBinding,
  isCapturingHotkey,
  isModalOpen,
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
  if (inTerminalFocus(event.target) && !(binding.alt || binding.ctrl)) return false;
  return true;
}

/** App shortcuts — Alt/Ctrl chords also work while a terminal is focused. */
export function useHotkeys() {
  const {
    spawnInFocused,
    splitFocused,
    closeFocusedPane,
    closeFocusedTab,
    openBrowserInFocused,
    workspaces,
    activeWorkspace,
    selectWorkspace,
    focusPane,
    focusNextAttention,
    isBusy,
    isVsCodeFocusActive,
    toggleBrowserFocusMode,
    reopenClosed,
    goFocusBack,
    goFocusForward,
    equalizeSplits,
    toggleMaximizeFocusedPane,
    removeWorkspace,
  } = useSpace();
  const { setView } = useView();
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
      if (isCapturingHotkey()) return;
      if (isModalOpen()) return;
      if (inPlainInput(event.target) && !(event.altKey || event.ctrlKey || event.metaKey)) {
        return;
      }

      const go = (binding: HotkeyBinding) => match(event, binding, true);

      if (go(bindings.browserFocusMode)) {
        event.preventDefault();
        toggleBrowserFocusMode();
        return;
      }
      if (isVsCodeFocusActive) return;

      if (go(bindings.newTab) || go(bindings.newTerminal)) {
        event.preventDefault();
        if (!isBusy) {
          setView("space");
          void spawnInFocused({ title: "Shell", accent: "green", mode: "tab" });
        }
        return;
      }
      if (go(bindings.closeTab)) {
        event.preventDefault();
        void closeFocusedTab();
        return;
      }
      if (go(bindings.closePane)) {
        event.preventDefault();
        void closeFocusedPane();
        return;
      }
      if (go(bindings.closeWorkspace)) {
        event.preventDefault();
        if (activeWorkspace) void removeWorkspace(activeWorkspace.id);
        return;
      }
      if (go(bindings.reopenClosed)) {
        event.preventDefault();
        void reopenClosed();
        return;
      }
      if (go(bindings.focusBack)) {
        event.preventDefault();
        goFocusBack();
        return;
      }
      if (go(bindings.focusForward)) {
        event.preventDefault();
        goFocusForward();
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
      if (go(bindings.maximizePane)) {
        event.preventDefault();
        toggleMaximizeFocusedPane();
        return;
      }
      if (go(bindings.equalizeSplits)) {
        event.preventDefault();
        equalizeSplits();
        return;
      }
      if (go(bindings.newBrowserTab)) {
        event.preventDefault();
        setView("space");
        void openBrowserInFocused(undefined, "tab");
        return;
      }
      if (go(bindings.focusOmnibar)) {
        event.preventDefault();
        setView("space");
        const leaf = activeWorkspace
          ? collectLeaves(activeWorkspace.layout).find(
              (l) => l.paneId === activeWorkspace.focusedPaneId,
            )
          : null;
        const hasBrowser = Boolean(leaf && (leaf.kind === "browser" || leaf.browserTabs?.length));
        if (hasBrowser) {
          window.dispatchEvent(new CustomEvent("voxiva-focus-omnibar"));
        } else {
          void openBrowserInFocused(undefined, "tab").then(() => {
            window.setTimeout(() => {
              window.dispatchEvent(new CustomEvent("voxiva-focus-omnibar"));
            }, 80);
          });
        }
        return;
      }
      if (go(bindings.renameWorkspace)) {
        event.preventDefault();
        window.dispatchEvent(new Event("voxiva-rename-workspace"));
        return;
      }
      if (go(bindings.renameTab)) {
        event.preventDefault();
        window.dispatchEvent(new Event("voxiva-rename-focused-tab"));
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
      if (go(bindings.jumpAttention)) {
        event.preventDefault();
        focusNextAttention();
        return;
      }
      if (go(bindings.nextWorkspace) || go(bindings.prevWorkspace)) {
        if (workspaces.length < 1) return;
        event.preventDefault();
        const idx = workspaces.findIndex((w) => w.id === activeWorkspace?.id);
        const delta = go(bindings.nextWorkspace) ? 1 : -1;
        const next =
          workspaces[(Math.max(0, idx) + delta + workspaces.length) % workspaces.length];
        if (next) {
          selectWorkspace(next.id);
          setView("space");
        }
        return;
      }
      if (go(bindings.newSpace)) {
        event.preventDefault();
        window.dispatchEvent(new Event("voxiva-new-space"));
        return;
      }
      if (go(bindings.spaceSettings)) {
        event.preventDefault();
        if (activeWorkspace) {
          window.dispatchEvent(
            new CustomEvent("voxiva-space-settings", {
              detail: { workspaceId: activeWorkspace.id },
            }),
          );
        }
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
      if (go(bindings.viewProjects)) {
        event.preventDefault();
        setView("projects");
        return;
      }
      if (go(bindings.history)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("voxiva-open-vault"));
        return;
      }
      if (go(bindings.browser)) {
        event.preventDefault();
        setView("space");
        void openBrowserInFocused(undefined, "tab");
        return;
      }
      if (go(bindings.settings)) {
        event.preventDefault();
        setView("settings");
        return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    bindings,
    setView,
    spawnInFocused,
    openBrowserInFocused,
    splitFocused,
    closeFocusedPane,
    closeFocusedTab,
    removeWorkspace,
    reopenClosed,
    goFocusBack,
    goFocusForward,
    equalizeSplits,
    toggleMaximizeFocusedPane,
    workspaces,
    activeWorkspace,
    selectWorkspace,
    focusPane,
    focusNextAttention,
    isBusy,
    isVsCodeFocusActive,
    toggleBrowserFocusMode,
  ]);

  return { bindings, defaults: DEFAULT_HOTKEYS };
}
