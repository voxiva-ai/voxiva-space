import type { DropZone } from "@/features/workspace/layout";
import type { MsgKey } from "@/i18n";
import { endAgentDragSession, isAgentDragActive } from "@/features/agents/drag";
import {
  agentChatShellInPane,
  agentShellFromPoint,
  resetAgentChatDropSticky,
} from "@/features/agents/agentChatDrop";

/**
 * Shared hit-test for history / tabs / files:
 * - center → add beside as a tab in the same pane
 * - edge → 50/50 split (original stays)
 */
export function dropZoneAt(rect: DOMRect, clientX: number, clientY: number): DropZone {
  const rx = (clientX - rect.left) / Math.max(1, rect.width);
  const ry = (clientY - rect.top) / Math.max(1, rect.height);
  const dx = rx - 0.5;
  const dy = ry - 0.5;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  // Comfortable center for "add as tab"; edges for split.
  if (absDx < 0.22 && absDy < 0.22) return "center";
  if (absDx >= absDy) return dx < 0 ? "left" : "right";
  return dy < 0 ? "top" : "bottom";
}

/** @deprecated Use dropZoneAt — same zones for history and everything else. */
export function dropZoneAtHistory(
  rect: DOMRect,
  clientX: number,
  clientY: number,
  _busy?: boolean,
): DropZone {
  return dropZoneAt(rect, clientX, clientY);
}

/**
 * File-drop zones inside a pane.
 * - Agent terminal (anywhere on the shell) → attach into chat (@path), like cmux.
 * - Elsewhere → center tab / edge split.
 */
export function resolveFileDropZone(
  paneEl: HTMLElement,
  clientX: number,
  clientY: number,
): DropZone | "chat" {
  const shell = agentShellFromPoint(clientX, clientY);
  if (shell && shell.closest("[data-pane-id]") === paneEl) {
    return "chat";
  }
  return dropZoneAt(paneEl.getBoundingClientRect(), clientX, clientY);
}

export type ResolvedDropTarget = {
  paneEl: HTMLElement;
  paneId: string;
  zone: DropZone;
  snapEl: HTMLElement | null;
  snapId: string | null;
};

function paneFromPoint(clientX: number, clientY: number): HTMLElement | null {
  const stack =
    typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(clientX, clientY)
      : ([document.elementFromPoint(clientX, clientY)].filter(Boolean) as Element[]);
  for (const el of stack) {
    const pane = (el as Element).closest?.("[data-pane-id].vs-pane") as HTMLElement | null;
    if (pane?.getAttribute("data-pane-id")) return pane;
  }
  return null;
}

export function resolveDropTargetAt(clientX: number, clientY: number): ResolvedDropTarget | null {
  const el = document.elementFromPoint(clientX, clientY);
  const snap = el?.closest("[data-snap-layout]") as HTMLElement | null;
  const snapId = snap?.getAttribute("data-snap-layout") ?? null;
  const paneEl = paneFromPoint(clientX, clientY);
  if (!paneEl) {
    if (snap && snapId) {
      return {
        paneEl: snap,
        paneId: "",
        zone: "center",
        snapEl: snap,
        snapId,
      };
    }
    return null;
  }
  const paneId = paneEl.getAttribute("data-pane-id");
  if (!paneId) return null;
  const zone = dropZoneAt(paneEl.getBoundingClientRect(), clientX, clientY);
  return { paneEl, paneId, zone, snapEl: snap, snapId };
}

/** Same zones as tabs/files — center = tab beside, edge = split. */
export function resolveHistoryDropTargetAt(
  clientX: number,
  clientY: number,
  _isPaneBusy?: (paneId: string) => boolean,
): ResolvedDropTarget | null {
  return resolveDropTargetAt(clientX, clientY);
}

export function clearPaneDropClasses() {
  document
    .querySelectorAll(".vs-pane.is-dropTarget, .vs-pane.is-tabDrop, .vs-pane.is-fileDrop")
    .forEach((node) => {
      node.classList.remove("is-dropTarget", "is-tabDrop", "is-fileDrop");
      node.removeAttribute("data-drop-zone");
      node.removeAttribute("data-drop-hint");
    });
  document.querySelectorAll(".vs-snapOption.is-dropTarget").forEach((node) => {
    node.classList.remove("is-dropTarget");
  });
  document.querySelectorAll(".vs-terminalShell.is-dropChat").forEach((node) => {
    node.classList.remove("is-dropChat");
  });
}

let fileDropPaintKey = "";

/** Clear all file-drop chrome (pane frames + chat band). */
export function clearFileDropPaint() {
  fileDropPaintKey = "";
  document.querySelectorAll(".vs-terminalShell.is-dropChat").forEach((node) => {
    resetAgentChatDropSticky(node as HTMLElement);
    node.classList.remove("is-dropChat");
  });
  clearPaneDropClasses();
}

/** Paint file-drop target once per zone change — avoids blink between chat / center. */
export function syncFileDropPaint(
  clientX: number,
  clientY: number,
  t: (key: MsgKey) => string,
) {
  const target = resolveDropTargetAt(clientX, clientY);
  if (!target?.paneId) {
    if (fileDropPaintKey) clearFileDropPaint();
    return;
  }

  const zone = resolveFileDropZone(target.paneEl, clientX, clientY);
  const key = `${target.paneId}:${zone}`;
  if (fileDropPaintKey === key) return;
  fileDropPaintKey = key;

  clearPaneDropClasses();

  if (zone === "chat") {
    const shell =
      agentShellFromPoint(clientX, clientY) ?? agentChatShellInPane(target.paneEl);
    shell?.classList.add("is-dropChat");
    return;
  }

  const hint = `${t("space.drop.file")} · ${t(dropZoneLabelKey(zone))}`;
  markPaneDrop(target.paneEl, zone, {
    asFile: true,
    asTabMerge: zone === "center",
    hint,
  });
}

export function markPaneDrop(
  el: HTMLElement,
  zone: DropZone,
  opts?: { asTabMerge?: boolean; asFile?: boolean; hint?: string },
) {
  el.setAttribute("data-drop-zone", zone);
  if (opts?.hint) el.setAttribute("data-drop-hint", opts.hint);
  else el.removeAttribute("data-drop-hint");
  el.classList.remove("is-dropTarget", "is-tabDrop", "is-fileDrop");
  if (opts?.asFile) {
    el.classList.add("is-fileDrop");
    if (opts.asTabMerge && zone === "center") el.classList.add("is-tabDrop");
    return;
  }
  if (opts?.asTabMerge && zone === "center") {
    el.classList.add("is-tabDrop");
  } else {
    el.classList.add("is-dropTarget");
  }
}

export function dropZoneLabelKey(zone: DropZone): MsgKey {
  if (zone === "left") return "space.drop.left";
  if (zone === "right") return "space.drop.right";
  if (zone === "top") return "space.drop.top";
  if (zone === "bottom") return "space.drop.bottom";
  return "space.drop.center";
}

export type PaneDragKind = "pane" | "tab" | "file" | "history";

export function emitPaneDrag(active: boolean, kind: PaneDragKind = "pane") {
  window.dispatchEvent(new CustomEvent("voxiva-pane-drag", { detail: { active, kind } }));
}

/** Always clear drag chrome so terminals stay interactive after a drop/cancel. */
export function resetDragUi() {
  document.body.classList.remove("is-agent-dragging", "is-tab-dragging");
  clearFileDropPaint();
  const ghost = document.getElementById("vs-history-drag-ghost");
  if (ghost) ghost.remove();
  endAgentDragSession();
}

export function isExternalFileDrag(types: readonly string[]) {
  if (isAgentDragActive()) return false;
  if (types.includes("Files")) return true;
  if (types.includes("application/x-voxiva-path")) return true;
  if (types.includes("application/x-voxiva-text")) return false;
  if (types.includes("application/x-voxiva-agent")) return false;
  return types.includes("text/plain") || types.includes("text/uri-list");
}
