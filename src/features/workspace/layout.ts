import type { PaneKind, SplitDirection, SplitNode } from "@/lib/types";
import { uid } from "@/lib/constants";

export type LeafNode = Extract<SplitNode, { type: "leaf" }>;

export function createLeaf(
  sessionId: string | null = null,
  kind: PaneKind = "terminal",
  browserUrl: string | null = null,
): LeafNode {
  return {
    type: "leaf",
    paneId: uid("pane"),
    kind,
    sessionId: kind === "terminal" ? sessionId : null,
    browserUrl: kind === "browser" ? browserUrl : null,
  };
}

export function createBrowserLeaf(url: string | null = null): LeafNode {
  return createLeaf(null, "browser", url);
}

export function countLeaves(node: SplitNode): number {
  if (node.type === "leaf") return 1;
  return countLeaves(node.first) + countLeaves(node.second);
}

export function findLeaf(node: SplitNode, paneId: string): LeafNode | null {
  if (node.type === "leaf") return node.paneId === paneId ? node : null;
  return findLeaf(node.first, paneId) || findLeaf(node.second, paneId);
}

export function mapLeaves(node: SplitNode, fn: (leaf: LeafNode) => LeafNode): SplitNode {
  if (node.type === "leaf") return fn(node);
  return {
    ...node,
    first: mapLeaves(node.first, fn),
    second: mapLeaves(node.second, fn),
  };
}

export function setLeafSession(node: SplitNode, paneId: string, sessionId: string | null): SplitNode {
  return mapLeaves(node, (leaf) =>
    leaf.paneId === paneId ? { ...leaf, kind: "terminal", sessionId, browserUrl: null } : leaf,
  );
}

export function setLeafBrowser(node: SplitNode, paneId: string, browserUrl: string | null): SplitNode {
  return mapLeaves(node, (leaf) =>
    leaf.paneId === paneId ? { ...leaf, kind: "browser", sessionId: null, browserUrl } : leaf,
  );
}

export function collectSessionIds(node: SplitNode): string[] {
  if (node.type === "leaf") return node.sessionId ? [node.sessionId] : [];
  return [...collectSessionIds(node.first), ...collectSessionIds(node.second)];
}

export function collectLeaves(node: SplitNode): LeafNode[] {
  if (node.type === "leaf") return [node];
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

export function splitPane(
  node: SplitNode,
  paneId: string,
  direction: SplitDirection,
  newSessionId: string | null = null,
): SplitNode {
  if (node.type === "leaf") {
    if (node.paneId !== paneId) return node;
    return {
      type: "split",
      id: uid("split"),
      direction,
      ratio: 0.5,
      first: node,
      second: createLeaf(newSessionId),
    };
  }
  return {
    ...node,
    first: splitPane(node.first, paneId, direction, newSessionId),
    second: splitPane(node.second, paneId, direction, newSessionId),
  };
}

/** Remove a leaf; promote sibling when under a split. */
export function removePane(node: SplitNode, paneId: string): SplitNode | null {
  if (node.type === "leaf") {
    return node.paneId === paneId ? null : node;
  }
  const first = removePane(node.first, paneId);
  const second = removePane(node.second, paneId);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function firstPaneId(node: SplitNode): string {
  if (node.type === "leaf") return node.paneId;
  return firstPaneId(node.first);
}

export function setRatio(node: SplitNode, splitId: string, ratio: number): SplitNode {
  if (node.type === "leaf") return node;
  if (node.id === splitId) {
    return { ...node, ratio: clampRatio(ratio) };
  }
  return {
    ...node,
    first: setRatio(node.first, splitId, ratio),
    second: setRatio(node.second, splitId, ratio),
  };
}

const RATIO_MIN = 0.22;
const RATIO_MAX = 0.78;

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, ratio));
}

/** Clamp every split ratio so panes never collapse into useless strips. */
export function clampLayoutRatios(node: SplitNode): SplitNode {
  if (node.type === "leaf") return node;
  return {
    ...node,
    ratio: clampRatio(node.ratio),
    first: clampLayoutRatios(node.first),
    second: clampLayoutRatios(node.second),
  };
}

export function findPaneForSession(node: SplitNode, sessionId: string): string | null {
  if (node.type === "leaf") return node.sessionId === sessionId ? node.paneId : null;
  return findPaneForSession(node.first, sessionId) || findPaneForSession(node.second, sessionId);
}

export function swapPaneContents(node: SplitNode, fromPaneId: string, toPaneId: string): SplitNode {
  if (fromPaneId === toPaneId) return node;
  const from = findLeaf(node, fromPaneId);
  const to = findLeaf(node, toPaneId);
  if (!from || !to) return node;
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId === fromPaneId) {
      return {
        ...leaf,
        kind: to.kind,
        sessionId: to.sessionId,
        browserUrl: to.browserUrl,
      };
    }
    if (leaf.paneId === toPaneId) {
      return {
        ...leaf,
        kind: from.kind,
        sessionId: from.sessionId,
        browserUrl: from.browserUrl,
      };
    }
    return leaf;
  });
}

export type GridPreset = 1 | 2 | 4 | 8;

/** Windows-style snap arrangements for the workspace. */
export type SnapLayoutId =
  | "single"
  | "two"
  | "twoWide"
  | "mainStack"
  | "three"
  | "quad";

export const SNAP_LAYOUTS: Array<{
  id: SnapLayoutId;
  panes: number;
  /** CSS grid template for the mini preview icon */
  preview: string;
}> = [
  { id: "single", panes: 1, preview: "1fr / 1fr" },
  { id: "two", panes: 2, preview: "1fr / 1fr 1fr" },
  { id: "twoWide", panes: 2, preview: "1fr / 1.4fr 0.8fr" },
  { id: "mainStack", panes: 3, preview: "1fr 1fr / 1.3fr 0.9fr" },
  { id: "three", panes: 3, preview: "1fr / 1fr 1fr 1fr" },
  { id: "quad", panes: 4, preview: "1fr 1fr / 1fr 1fr" },
];

function buildPair(ratio = 0.5): SplitNode {
  return {
    type: "split",
    id: uid("split"),
    direction: "h",
    ratio,
    first: createLeaf(null),
    second: createLeaf(null),
  };
}

function buildQuad(): SplitNode {
  return {
    type: "split",
    id: uid("split"),
    direction: "v",
    ratio: 0.5,
    first: buildPair(),
    second: buildPair(),
  };
}

function buildMainStack(): SplitNode {
  // Wide main pane on the left, two stacked on the right — never a thin strip.
  return {
    type: "split",
    id: uid("split"),
    direction: "h",
    ratio: 0.58,
    first: createLeaf(null),
    second: {
      type: "split",
      id: uid("split"),
      direction: "v",
      ratio: 0.5,
      first: createLeaf(null),
      second: createLeaf(null),
    },
  };
}

function buildThree(): SplitNode {
  // Three equal columns via nested horizontal splits: 1/3 | (1/2 of 2/3) | (1/2 of 2/3).
  return {
    type: "split",
    id: uid("split"),
    direction: "h",
    ratio: 1 / 3,
    first: createLeaf(null),
    second: {
      type: "split",
      id: uid("split"),
      direction: "h",
      ratio: 0.5,
      first: createLeaf(null),
      second: createLeaf(null),
    },
  };
}

export function buildSnapLayout(id: SnapLayoutId): SplitNode {
  switch (id) {
    case "single":
      return createLeaf(null);
    case "two":
      return buildPair(0.5);
    case "twoWide":
      return buildPair(0.62);
    case "mainStack":
      return buildMainStack();
    case "three":
      return buildThree();
    case "quad":
      return buildQuad();
  }
}

/** Grow a layout tree until it has at least `count` leaves (never drops panes). */
export function expandLayoutToCount(layout: SplitNode, count: number): SplitNode {
  let next = layout;
  let guard = 0;
  while (countLeaves(next) < count && guard < 24) {
    const ids = collectPaneIds(next);
    const anchor = ids[ids.length - 1] ?? firstPaneId(next);
    const direction: SplitDirection = countLeaves(next) % 2 === 0 ? "v" : "h";
    next = equalizeLayout(splitPane(next, anchor, direction, null));
    guard += 1;
  }
  return next;
}

/** Drop trailing empty slots only — used when snap has more slots than live panes. */
export function shrinkLayoutToCount(layout: SplitNode, count: number): SplitNode {
  let next: SplitNode | null = layout;
  let guard = 0;
  while (next && countLeaves(next) > count && guard < 24) {
    const ids = collectPaneIds(next);
    const dropId = ids[ids.length - 1];
    next = removePane(next, dropId);
    if (next) next = equalizeLayout(next);
    guard += 1;
  }
  return next ?? createLeaf(null);
}

/** BridgeSpace-style workspace templates. */
export function buildGridLayout(count: GridPreset): SplitNode {
  if (count === 1) return createLeaf(null);
  if (count === 2) return buildPair();
  if (count === 4) return buildQuad();
  return {
    type: "split",
    id: uid("split"),
    direction: "v",
    ratio: 0.5,
    first: buildQuad(),
    second: buildQuad(),
  };
}

/** New space: 1/2/4/8 terminals, optional extra browser pane. */
export function buildCreateLayout(grid: GridPreset, withBrowser: boolean): SplitNode {
  let layout = buildGridLayout(grid);
  if (withBrowser) {
    layout = expandLayoutToCount(layout, countLeaves(layout) + 1);
    const ids = collectPaneIds(layout);
    layout = setLeafBrowser(layout, ids[ids.length - 1], null);
  }
  return clampLayoutRatios(layout);
}

/** @deprecated use buildCreateLayout */
export function buildStarterLayout(terminals: number, withBrowser: boolean): SplitNode {
  const n = Math.max(1, Math.min(4, Math.floor(terminals)));
  const grid: GridPreset = n <= 1 ? 1 : n === 2 ? 2 : 4;
  return buildCreateLayout(grid, withBrowser);
}

export function collectPaneIds(node: SplitNode): string[] {
  if (node.type === "leaf") return [node.paneId];
  return [...collectPaneIds(node.first), ...collectPaneIds(node.second)];
}

/** Keep every pane sized so the full tree fills the screen evenly. */
export function equalizeLayout(node: SplitNode): SplitNode {
  if (node.type === "leaf") return node;
  const left = countLeaves(node.first);
  const right = countLeaves(node.second);
  const total = Math.max(1, left + right);
  return {
    ...node,
    ratio: clampRatio(left / total),
    first: equalizeLayout(node.first),
    second: equalizeLayout(node.second),
  };
}
