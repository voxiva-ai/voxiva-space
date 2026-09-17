import type { BrowserTabState, PaneKind, SplitDirection, SplitNode } from "@/lib/types";
import { uid } from "@/lib/constants";

export type LeafNode = Extract<SplitNode, { type: "leaf" }>;

export function createLeaf(
  sessionId: string | null = null,
  kind: PaneKind = "terminal",
  browserUrl: string | null = null,
): LeafNode {
  const tabs =
    kind === "browser"
      ? [{ id: uid("b"), url: browserUrl ?? "" }]
      : undefined;
  return {
    type: "leaf",
    paneId: uid("pane"),
    kind,
    sessionId: kind === "terminal" ? sessionId : null,
    sessionIds: kind === "terminal" && sessionId ? [sessionId] : [],
    browserUrl: kind === "browser" ? (browserUrl ?? "") : null,
    browserTabs: tabs,
    activeBrowserId: tabs?.[0]?.id ?? null,
    mediaPath: null,
  };
}

export function createBrowserLeaf(url: string | null = null): LeafNode {
  return createLeaf(null, "browser", url ?? "");
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

/** Sentinel id for the browser surface inside `tabOrder` (legacy single-tab). */
export const BROWSER_TAB = "__browser__";
/** Prefix for multi-browser tab keys: `__browser__:<id>`. */
export const BROWSER_TAB_PREFIX = "__browser__:";
/** Sentinel id for in-pane image / video / audio / PDF preview. */
export const MEDIA_TAB = "__media__";

export function makeBrowserTabKey(id: string) {
  return id === "legacy" ? BROWSER_TAB : `${BROWSER_TAB_PREFIX}${id}`;
}

export function isBrowserTabKey(id: string) {
  return id === BROWSER_TAB || id.startsWith(BROWSER_TAB_PREFIX);
}

export function browserIdFromTabKey(key: string): string | null {
  if (key === BROWSER_TAB) return "legacy";
  if (key.startsWith(BROWSER_TAB_PREFIX)) return key.slice(BROWSER_TAB_PREFIX.length);
  return null;
}

/** Normalize legacy `browserUrl` into `browserTabs`. */
export function normalizeBrowserTabs(leaf: LeafNode): BrowserTabState[] {
  if (leaf.browserTabs && leaf.browserTabs.length > 0) return leaf.browserTabs;
  if (leaf.browserUrl !== null) {
    return [{ id: "legacy", url: leaf.browserUrl }];
  }
  return [];
}

export function activeBrowserTab(leaf: LeafNode): BrowserTabState | null {
  const tabs = normalizeBrowserTabs(leaf);
  if (!tabs.length) return null;
  const active = leaf.activeBrowserId
    ? tabs.find((t) => t.id === leaf.activeBrowserId)
    : null;
  return active ?? tabs[tabs.length - 1] ?? null;
}

/** Media-only leaf (image / video / audio / PDF) — never auto-spawns a shell. */
export function createMediaLeaf(mediaPath: string): LeafNode {
  const path = mediaPath.trim();
  return {
    type: "leaf",
    paneId: uid("pane"),
    kind: "media",
    sessionId: null,
    sessionIds: [],
    browserUrl: null,
    browserTabs: [],
    activeBrowserId: null,
    mediaPath: path || null,
    tabOrder: path ? [MEDIA_TAB] : [],
  };
}

const SURFACE_SENTINELS = new Set([BROWSER_TAB, MEDIA_TAB]);

function isSurfaceTabKey(id: string) {
  return SURFACE_SENTINELS.has(id) || isBrowserTabKey(id);
}

/** Terminal tabs — kept even while the browser / media tab is active. */
export function leafTabIds(leaf: LeafNode): string[] {
  const ids = leaf.sessionIds?.filter(Boolean) ?? [];
  if (ids.length) return ids;
  return leaf.sessionId ? [leaf.sessionId] : [];
}

/** Browser tab exists in this pane (alongside shells). */
export function leafHasBrowser(leaf: LeafNode): boolean {
  return normalizeBrowserTabs(leaf).length > 0;
}

export function leafHasMedia(leaf: LeafNode): boolean {
  return Boolean(leaf.mediaPath);
}

function leafBrowserKeys(leaf: LeafNode): string[] {
  return normalizeBrowserTabs(leaf).map((t) => makeBrowserTabKey(t.id));
}

/** Ordered tab keys: session ids + browser tabs + optional media. */
export function leafTabOrder(leaf: LeafNode): string[] {
  const sessions = leafTabIds(leaf);
  const browsers = leafBrowserKeys(leaf);
  const extras = [...browsers, ...(leafHasMedia(leaf) ? [MEDIA_TAB] : [])];
  const valid = new Set<string>([...sessions, ...extras]);
  const kept = (leaf.tabOrder ?? []).filter((id) => valid.has(id));
  const missing = [...sessions, ...extras].filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

function withTabOrder(leaf: LeafNode, order: string[]): LeafNode {
  const sessions = order.filter((id) => !isSurfaceTabKey(id));
  const browserKeys = order.filter((id) => isBrowserTabKey(id));
  const hasMedia = order.includes(MEDIA_TAB);
  const prevTabs = normalizeBrowserTabs(leaf);
  const byId = new Map(prevTabs.map((t) => [t.id, t]));
  const nextTabs: BrowserTabState[] = [];
  for (const key of browserKeys) {
    const id = browserIdFromTabKey(key);
    if (!id) continue;
    nextTabs.push(byId.get(id) ?? { id, url: "" });
  }
  const activeId =
    leaf.activeBrowserId && nextTabs.some((t) => t.id === leaf.activeBrowserId)
      ? leaf.activeBrowserId
      : nextTabs[nextTabs.length - 1]?.id ?? null;
  const activeUrl = nextTabs.find((t) => t.id === activeId)?.url ?? null;
  return {
    ...leaf,
    sessionIds: sessions,
    sessionId:
      leaf.sessionId && sessions.includes(leaf.sessionId) ? leaf.sessionId : sessions[0] ?? null,
    tabOrder: order,
    browserTabs: nextTabs,
    activeBrowserId: activeId,
    browserUrl: nextTabs.length ? (activeUrl ?? "") : null,
    mediaPath: hasMedia ? leaf.mediaPath || null : null,
  };
}

/**
 * Always append a new browser tab in-pane (cmux: many browsers in one strip).
 * Pass `reuseIfEmpty` only when focusing an existing empty slot.
 */
export function openBrowserTab(node: SplitNode, paneId: string): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const id = uid("b");
    const tabs = [...normalizeBrowserTabs(leaf), { id, url: "" }];
    const key = makeBrowserTabKey(id);
    const order = leafTabOrder({
      ...leaf,
      browserTabs: tabs,
      browserUrl: "",
      activeBrowserId: id,
    });
    const nextOrder = order.includes(key) ? order : [...order, key];
    // Activate the new browser tab at the end of the strip.
    const activated = [...nextOrder.filter((k) => k !== key), key];
    return {
      ...withTabOrder(
        { ...leaf, browserTabs: tabs, browserUrl: "", activeBrowserId: id },
        activated,
      ),
      kind: "browser",
    };
  });
}

export function focusBrowserTab(node: SplitNode, paneId: string, tabKey?: string): SplitNode {
  const current = findLeaf(node, paneId);
  if (!current) return node;
  if (!normalizeBrowserTabs(current).length) return openBrowserTab(node, paneId);
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const tabs = normalizeBrowserTabs(leaf);
    const key =
      tabKey && isBrowserTabKey(tabKey)
        ? tabKey
        : makeBrowserTabKey(leaf.activeBrowserId || tabs[tabs.length - 1]!.id);
    const id = browserIdFromTabKey(key) || tabs[tabs.length - 1]!.id;
    const order = leafTabOrder(leaf);
    const activated = [...order.filter((k) => k !== key), key];
    const url = tabs.find((t) => t.id === id)?.url ?? "";
    return {
      ...withTabOrder({ ...leaf, activeBrowserId: id, browserUrl: url }, activated),
      kind: "browser",
    };
  });
}

export function closeBrowserTab(node: SplitNode, paneId: string, tabKey?: string): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const closing =
      tabKey && isBrowserTabKey(tabKey)
        ? browserIdFromTabKey(tabKey)
        : leaf.activeBrowserId || normalizeBrowserTabs(leaf)[0]?.id || null;
    const tabs = normalizeBrowserTabs(leaf).filter((t) => t.id !== closing);
    const order = leafTabOrder(leaf).filter((id) => {
      if (!isBrowserTabKey(id)) return true;
      return browserIdFromTabKey(id) !== closing;
    });
    const nextKind: LeafNode["kind"] = order.some((id) => isBrowserTabKey(id))
      ? "browser"
      : order.includes(MEDIA_TAB)
        ? "media"
        : "terminal";
    const activeId = tabs[tabs.length - 1]?.id ?? null;
    return {
      ...withTabOrder(
        {
          ...leaf,
          browserTabs: tabs,
          activeBrowserId: activeId,
          browserUrl: tabs.length ? (tabs[tabs.length - 1]?.url ?? "") : null,
        },
        order,
      ),
      kind: nextKind,
      sessionId:
        leaf.sessionId && leafTabIds(leaf).includes(leaf.sessionId)
          ? leaf.sessionId
          : leafTabIds(leaf)[0] ?? null,
      sessionIds: leafTabIds(leaf),
    };
  });
}

/** Open / focus media preview tab (image / video / audio / PDF). */
export function openMediaTab(node: SplitNode, paneId: string, mediaPath: string): SplitNode {
  const path = mediaPath.trim();
  if (!path) return node;
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder({ ...leaf, mediaPath: path });
    const nextOrder = order.includes(MEDIA_TAB) ? order : [...order, MEDIA_TAB];
    return {
      ...withTabOrder({ ...leaf, mediaPath: path }, nextOrder),
      kind: "media",
      mediaPath: path,
    };
  });
}

export function closeMediaTab(node: SplitNode, paneId: string): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder(leaf).filter((id) => id !== MEDIA_TAB);
    const tabs = leafTabIds(leaf);
    const nextKind: LeafNode["kind"] = order.some((id) => isBrowserTabKey(id))
      ? "browser"
      : "terminal";
    return {
      ...withTabOrder({ ...leaf, mediaPath: null }, order),
      mediaPath: null,
      kind: nextKind,
      sessionId: leaf.sessionId && tabs.includes(leaf.sessionId) ? leaf.sessionId : tabs[0] ?? null,
      sessionIds: tabs,
    };
  });
}

/** Open media as a sibling tab (center drop) or replace path when already open. */
export function setLeafMedia(node: SplitNode, paneId: string, mediaPath: string | null): SplitNode {
  if (!mediaPath) return closeMediaTab(node, paneId);
  return openMediaTab(node, paneId, mediaPath);
}

/** Reorder a tab (session id or `BROWSER_TAB`) within a pane strip. */
export function reorderLeafTabs(
  node: SplitNode,
  paneId: string,
  fromId: string,
  toId: string,
): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder(leaf);
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return leaf;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return withTabOrder(leaf, next);
  });
}

/** Place `tabId` before `beforeId` (or at the end when `beforeId` is null). */
export function placeLeafTab(
  node: SplitNode,
  paneId: string,
  tabId: string,
  beforeId: string | null,
): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder(leaf);
    if (!order.includes(tabId)) return leaf;
    const rest = order.filter((id) => id !== tabId);
    if (beforeId === null) {
      if (order[order.length - 1] === tabId) return leaf;
      return withTabOrder(leaf, [...rest, tabId]);
    }
    const at = rest.indexOf(beforeId);
    if (at < 0) return leaf;
    const next = [...rest.slice(0, at), tabId, ...rest.slice(at)];
    if (next.every((id, i) => id === order[i])) return leaf;
    return withTabOrder(leaf, next);
  });
}

export function setLeafSession(node: SplitNode, paneId: string, sessionId: string | null): SplitNode {
  return mapLeaves(node, (leaf) =>
    leaf.paneId === paneId
      ? {
          ...leaf,
          kind: "terminal",
          sessionId,
          sessionIds: sessionId ? [sessionId] : [],
          browserUrl: null,
        }
      : leaf,
  );
}

/** Copy terminal/browser content (including all tabs) onto a target pane id. */
export function setLeafContents(node: SplitNode, paneId: string, source: LeafNode): SplitNode {
  return mapLeaves(node, (leaf) => (leaf.paneId === paneId ? copyLeafSurfaces(leaf, source) : leaf));
}

/** Append a terminal tab; make it active. Keeps existing tabs alive. */
export function addLeafSession(node: SplitNode, paneId: string, sessionId: string): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder(leaf);
    const nextOrder = order.includes(sessionId) ? order : [...order, sessionId];
    return {
      ...withTabOrder(leaf, nextOrder),
      kind: "terminal",
      sessionId,
    };
  });
}

export function activateLeafSession(node: SplitNode, paneId: string, sessionId: string): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const sessionIds = leafTabIds(leaf);
    if (!sessionIds.includes(sessionId)) return leaf;
    return { ...leaf, kind: "terminal", sessionId, sessionIds, tabOrder: leafTabOrder(leaf) };
  });
}

export function removeLeafSession(node: SplitNode, paneId: string, sessionId: string): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder(leaf).filter((id) => id !== sessionId);
    const sessionIds = order.filter((id) => !isSurfaceTabKey(id));
    const nextActive =
      leaf.sessionId === sessionId ? sessionIds[sessionIds.length - 1] ?? null : leaf.sessionId;
    const nextKind: LeafNode["kind"] = order.includes(MEDIA_TAB)
      ? "media"
      : order.some((id) => isBrowserTabKey(id))
        ? "browser"
        : "terminal";
    return {
      ...withTabOrder(leaf, order),
      sessionIds,
      sessionId: nextActive && sessionIds.includes(nextActive) ? nextActive : sessionIds[0] ?? null,
      kind: nextKind,
    };
  });
}

/** Swap a tab id in-place (restore / respawn without dropping the tab strip). */
export function replaceLeafSessionId(
  node: SplitNode,
  paneId: string,
  fromId: string,
  toId: string,
): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const order = leafTabOrder(leaf).map((id) => (id === fromId ? toId : id));
    const sessionIds = order.filter((id) => !isSurfaceTabKey(id));
    const nextActive =
      leaf.sessionId === fromId
        ? toId
        : leaf.sessionId && sessionIds.includes(leaf.sessionId)
          ? leaf.sessionId
          : sessionIds[0] ?? null;
    return {
      ...withTabOrder(leaf, order),
      sessionIds,
      sessionId: nextActive,
      kind: "terminal",
    };
  });
}

export function setLeafBrowser(
  node: SplitNode,
  paneId: string,
  browserUrl: string | null,
  tabKey?: string,
): SplitNode {
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId !== paneId) return leaf;
    const tabs = normalizeBrowserTabs(leaf);
    if (!tabs.length) {
      const id = uid("b");
      const nextTabs = [{ id, url: browserUrl ?? "" }];
      const key = makeBrowserTabKey(id);
      const order = [...leafTabOrder(leaf).filter((k) => !isBrowserTabKey(k)), key];
      return {
        ...withTabOrder(
          { ...leaf, browserTabs: nextTabs, activeBrowserId: id, browserUrl: browserUrl ?? "" },
          order,
        ),
        kind: "browser",
      };
    }
    const targetId =
      (tabKey && browserIdFromTabKey(tabKey)) ||
      leaf.activeBrowserId ||
      tabs[tabs.length - 1]!.id;
    const nextTabs = tabs.map((t) =>
      t.id === targetId ? { ...t, url: browserUrl ?? "" } : t,
    );
    const activeId =
      leaf.activeBrowserId && nextTabs.some((t) => t.id === leaf.activeBrowserId)
        ? leaf.activeBrowserId
        : targetId;
    const activeUrl = nextTabs.find((t) => t.id === activeId)?.url ?? browserUrl ?? "";
    return {
      ...leaf,
      kind: "browser",
      browserTabs: nextTabs,
      activeBrowserId: activeId,
      browserUrl: activeUrl ?? "",
    };
  });
}

/** Move a shell tab or the browser tab from one pane to another (keeps session id / URL). */
export function moveTabToPane(
  layout: SplitNode,
  fromPaneId: string,
  toPaneId: string,
  tabId: string,
): SplitNode {
  if (fromPaneId === toPaneId) return layout;
  const from = findLeaf(layout, fromPaneId);
  const to = findLeaf(layout, toPaneId);
  if (!from || !to) return layout;

  if (isBrowserTabKey(tabId)) {
    if (!leafHasBrowser(from)) return layout;
    const fromId = browserIdFromTabKey(tabId);
    const fromTab =
      normalizeBrowserTabs(from).find((t) => t.id === fromId) ||
      activeBrowserTab(from);
    if (!fromTab) return layout;
    let next = closeBrowserTab(layout, fromPaneId, tabId);
    next = openBrowserTab(next, toPaneId);
    // New tab is active — set its URL to the moved one.
    next = setLeafBrowser(next, toPaneId, fromTab.url);
    return next;
  }

  if (tabId === MEDIA_TAB) {
    if (!leafHasMedia(from) || !from.mediaPath) return layout;
    const fromPath = from.mediaPath;
    if (leafHasMedia(to)) {
      const toPath = to.mediaPath ?? "";
      let next = setLeafMedia(layout, fromPaneId, toPath || null);
      next = setLeafMedia(next, toPaneId, fromPath);
      return next;
    }
    let next = closeMediaTab(layout, fromPaneId);
    next = setLeafMedia(next, toPaneId, fromPath);
    return next;
  }

  if (!leafTabIds(from).includes(tabId)) return layout;
  let next = removeLeafSession(layout, fromPaneId, tabId);
  next = addLeafSession(next, toPaneId, tabId);
  return next;
}

export function collectSessionIds(node: SplitNode): string[] {
  if (node.type === "leaf") return leafTabIds(node);
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

/** Split a leaf and put `secondLeaf` as the new sibling (browser / moved pane). */
export function splitPaneWith(
  node: SplitNode,
  paneId: string,
  direction: SplitDirection,
  secondLeaf: LeafNode,
  secondFirst = false,
): SplitNode {
  if (node.type === "leaf") {
    if (node.paneId !== paneId) return node;
    return {
      type: "split",
      id: uid("split"),
      direction,
      ratio: 0.5,
      first: secondFirst ? secondLeaf : node,
      second: secondFirst ? node : secondLeaf,
    };
  }
  return {
    ...node,
    first: splitPaneWith(node.first, paneId, direction, secondLeaf, secondFirst),
    second: splitPaneWith(node.second, paneId, direction, secondLeaf, secondFirst),
  };
}

export type DropZone = "left" | "right" | "top" | "bottom" | "center";

type SplitParent = Extract<SplitNode, { type: "split" }>;

function sameBranch(a: SplitNode, b: SplitNode): boolean {
  if (a.type === "leaf" && b.type === "leaf") return a.paneId === b.paneId;
  if (a.type === "split" && b.type === "split") return a.id === b.id;
  return false;
}

function replaceChild(parent: SplitParent, oldChild: SplitNode, nextChild: SplitNode): SplitParent {
  if (sameBranch(parent.first, oldChild)) return { ...parent, first: nextChild };
  return { ...parent, second: nextChild };
}

/** Walk tree; return parent split of `paneId` or null if root leaf. */
function findParent(
  node: SplitNode,
  paneId: string,
  parent: SplitParent | null = null,
): { parent: SplitParent | null; child: SplitNode } | null {
  if (node.type === "leaf") {
    return node.paneId === paneId ? { parent, child: node } : null;
  }
  return findParent(node.first, paneId, node) || findParent(node.second, paneId, node);
}

/**
 * Insert `leaf` next to `toId` on the given edge.
 * Prefers becoming a sibling in an existing matching-direction split (so you can
 * pull a pane between two others and get three equal columns/rows).
 */
export function insertBeside(
  layout: SplitNode,
  toId: string,
  leaf: LeafNode,
  zone: Exclude<DropZone, "center">,
): SplitNode {
  const direction: SplitDirection = zone === "left" || zone === "right" ? "h" : "v";
  const before = zone === "left" || zone === "top";
  const found = findParent(layout, toId);
  if (!found) return layout;

  const { parent, child } = found;

  // Target is root leaf — simple wrap.
  if (!parent) {
    return {
      type: "split",
      id: uid("split"),
      direction,
      ratio: 0.5,
      first: before ? leaf : child,
      second: before ? child : leaf,
    };
  }

  // Parent already splits on the same axis — nest beside the target child.
  if (parent.direction === direction) {
    const wrapped: SplitParent = {
      type: "split",
      id: uid("split"),
      direction,
      ratio: 0.5,
      first: before ? leaf : child,
      second: before ? child : leaf,
    };
    const nextParent = replaceChild(parent, child, wrapped);
    return mapReplaceSplit(layout, parent.id, equalizeLayout(nextParent));
  }

  // Different axis — split the leaf itself.
  return splitPaneWith(layout, toId, direction, leaf, before);
}

function mapReplaceSplit(node: SplitNode, splitId: string, next: SplitNode): SplitNode {
  if (node.type === "leaf") return node;
  if (node.id === splitId) return next;
  return {
    ...node,
    first: mapReplaceSplit(node.first, splitId, next),
    second: mapReplaceSplit(node.second, splitId, next),
  };
}

/** Detach a pane and dock it beside/onto another (or swap on center). */
export function movePane(
  layout: SplitNode,
  fromId: string,
  toId: string,
  zone: DropZone,
): SplitNode {
  if (fromId === toId) return layout;
  if (zone === "center") return swapPaneContents(layout, fromId, toId);

  const fromLeaf = findLeaf(layout, fromId);
  if (!fromLeaf || !findLeaf(layout, toId)) return layout;

  const detached: LeafNode = { ...fromLeaf };
  const rest = removePane(layout, fromId);
  if (!rest) return layout;

  return clampLayoutRatios(equalizeLayout(insertBeside(rest, toId, detached, zone)));
}

export function leafSurfaceCount(leaf: LeafNode) {
  return (
    leafTabIds(leaf).length +
    normalizeBrowserTabs(leaf).length +
    (leafHasMedia(leaf) ? 1 : 0)
  );
}

/** Copy tabs + browser onto another leaf without dropping the other kind. */
export function copyLeafSurfaces(target: LeafNode, source: LeafNode): LeafNode {
  return {
    type: "leaf",
    paneId: target.paneId,
    kind: source.kind,
    sessionId: source.sessionId,
    sessionIds: source.sessionIds ? [...source.sessionIds] : leafTabIds(source),
    tabOrder: leafTabOrder(source),
    browserUrl: source.browserUrl,
    mediaPath: source.mediaPath ?? null,
  };
}

export function remapLeafPaneIds(node: SplitNode, map: Record<string, string>): SplitNode {
  if (node.type === "leaf") {
    const nextId = map[node.paneId];
    return nextId && nextId !== node.paneId ? { ...node, paneId: nextId } : node;
  }
  return {
    ...node,
    first: remapLeafPaneIds(node.first, map),
    second: remapLeafPaneIds(node.second, map),
  };
}

/**
 * Dock a tab onto another pane: center merges into that pane's tabs;
 * edge splits the target (or moves a single-surface pane).
 * Returns the pane that should receive focus after the dock.
 */
export function dockTab(
  layout: SplitNode,
  fromPaneId: string,
  toPaneId: string,
  tabId: string,
  zone: DropZone,
): { layout: SplitNode; focusPaneId: string } {
  const from = findLeaf(layout, fromPaneId);
  const to = findLeaf(layout, toPaneId);
  if (!from || !to) return { layout, focusPaneId: fromPaneId };

  if (zone === "center") {
    if (fromPaneId === toPaneId) return { layout, focusPaneId: fromPaneId };
    let next = moveTabToPane(layout, fromPaneId, toPaneId, tabId);
    const emptied = findLeaf(next, fromPaneId);
    if (emptied && leafSurfaceCount(emptied) === 0) {
      const rest = removePane(next, fromPaneId);
      if (rest) next = clampLayoutRatios(equalizeLayout(rest));
    }
    return {
      layout: next,
      focusPaneId: findLeaf(next, toPaneId)?.paneId ?? firstPaneId(next),
    };
  }

  // Sole surface on a different pane → move the whole pane (keeps pane id / chrome).
  if (fromPaneId !== toPaneId && leafSurfaceCount(from) === 1) {
    return {
      layout: movePane(layout, fromPaneId, toPaneId, zone),
      focusPaneId: fromPaneId,
    };
  }

  let extracted: LeafNode;
  let next = layout;
  if (isBrowserTabKey(tabId)) {
    if (!leafHasBrowser(from)) return { layout, focusPaneId: fromPaneId };
    const bid = browserIdFromTabKey(tabId);
    const tab =
      normalizeBrowserTabs(from).find((t) => t.id === bid) || activeBrowserTab(from);
    extracted = createBrowserLeaf(tab?.url ?? "");
    next = closeBrowserTab(next, fromPaneId, tabId);
  } else if (tabId === MEDIA_TAB) {
    if (!leafHasMedia(from) || !from.mediaPath) return { layout, focusPaneId: fromPaneId };
    extracted = { ...createLeaf(null), kind: "media", mediaPath: from.mediaPath };
    next = closeMediaTab(next, fromPaneId);
  } else {
    if (!leafTabIds(from).includes(tabId)) return { layout, focusPaneId: fromPaneId };
    extracted = createLeaf(tabId);
    next = removeLeafSession(next, fromPaneId, tabId);
  }

  const after = findLeaf(next, fromPaneId);
  if (after && leafSurfaceCount(after) === 0) {
    if (fromPaneId === toPaneId) return { layout, focusPaneId: fromPaneId };
    const rest = removePane(next, fromPaneId);
    if (!rest || !findLeaf(rest, toPaneId)) return { layout, focusPaneId: fromPaneId };
    next = rest;
  }

  if (!findLeaf(next, toPaneId)) return { layout, focusPaneId: fromPaneId };
  return {
    layout: clampLayoutRatios(equalizeLayout(insertBeside(next, toPaneId, extracted, zone))),
    focusPaneId: extracted.paneId,
  };
}

/** Add a blank browser as a sibling of `paneId` (right or below). */
export function addBrowserBeside(
  layout: SplitNode,
  paneId: string,
  direction: SplitDirection = "h",
): { layout: SplitNode; paneId: string } | null {
  if (!findLeaf(layout, paneId)) return null;
  const leaf = createBrowserLeaf("");
  return {
    layout: clampLayoutRatios(equalizeLayout(splitPaneWith(layout, paneId, direction, leaf))),
    paneId: leaf.paneId,
  };
}

/** Add an empty terminal leaf beside `paneId` (new shell pane, not a tab). */
export function addShellBeside(
  layout: SplitNode,
  paneId: string,
  direction: SplitDirection = "h",
): { layout: SplitNode; paneId: string } | null {
  if (!findLeaf(layout, paneId)) return null;
  const leaf = createLeaf(null);
  return {
    layout: clampLayoutRatios(equalizeLayout(splitPaneWith(layout, paneId, direction, leaf))),
    paneId: leaf.paneId,
  };
}

/** Add an empty shell on a specific edge of `paneId` (left/right/top/bottom). */
export function addShellAtZone(
  layout: SplitNode,
  paneId: string,
  zone: Exclude<DropZone, "center">,
): { layout: SplitNode; paneId: string } | null {
  if (!findLeaf(layout, paneId)) return null;
  const leaf = createLeaf(null);
  return {
    layout: clampLayoutRatios(equalizeLayout(insertBeside(layout, paneId, leaf, zone))),
    paneId: leaf.paneId,
  };
}

/** Add a blank browser on a specific edge of `paneId`. */
export function addBrowserAtZone(
  layout: SplitNode,
  paneId: string,
  zone: Exclude<DropZone, "center">,
): { layout: SplitNode; paneId: string } | null {
  if (!findLeaf(layout, paneId)) return null;
  const leaf = createBrowserLeaf("");
  return {
    layout: clampLayoutRatios(equalizeLayout(insertBeside(layout, paneId, leaf, zone))),
    paneId: leaf.paneId,
  };
}

/** Add a media preview pane on a specific edge — no shell spawn. */
export function addMediaAtZone(
  layout: SplitNode,
  paneId: string,
  zone: Exclude<DropZone, "center">,
  mediaPath: string,
): { layout: SplitNode; paneId: string } | null {
  if (!findLeaf(layout, paneId)) return null;
  const path = mediaPath.trim();
  if (!path) return null;
  const leaf = createMediaLeaf(path);
  return {
    layout: clampLayoutRatios(equalizeLayout(insertBeside(layout, paneId, leaf, zone))),
    paneId: leaf.paneId,
  };
}

/** Add a blank browser as a new root column (separate from local groups). */
export function addBrowserRoot(layout: SplitNode): { layout: SplitNode; paneId: string } {
  const leaf = createBrowserLeaf("");
  const n = countLeaves(layout);
  return {
    layout: clampLayoutRatios({
      type: "split",
      id: uid("split"),
      direction: "h",
      ratio: clampRatio(n / (n + 1)),
      first: layout,
      second: leaf,
    }),
    paneId: leaf.paneId,
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
  if (node.type === "leaf") {
    return leafTabIds(node).includes(sessionId) ? node.paneId : null;
  }
  return findPaneForSession(node.first, sessionId) || findPaneForSession(node.second, sessionId);
}

export function swapPaneContents(node: SplitNode, fromPaneId: string, toPaneId: string): SplitNode {
  if (fromPaneId === toPaneId) return node;
  const from = findLeaf(node, fromPaneId);
  const to = findLeaf(node, toPaneId);
  if (!from || !to) return node;
  return mapLeaves(node, (leaf) => {
    if (leaf.paneId === fromPaneId) return copyLeafSurfaces(leaf, to);
    if (leaf.paneId === toPaneId) return copyLeafSurfaces(leaf, from);
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

/** Rearrange existing panes into a snap template. Keeps pane ids and all tabs. */
export function arrangeSnapLayout(
  layout: SplitNode,
  id: SnapLayoutId,
  primaryPaneId?: string,
): SplitNode {
  const oldLeaves = [...collectLeaves(layout)];
  if (oldLeaves.length === 0) return layout;
  if (primaryPaneId) {
    const idx = oldLeaves.findIndex((leaf) => leaf.paneId === primaryPaneId);
    if (idx > 0) {
      const [primary] = oldLeaves.splice(idx, 1);
      oldLeaves.unshift(primary);
    }
  }

  let next = buildSnapLayout(id);
  const need = oldLeaves.length;
  if (countLeaves(next) < need) next = expandLayoutToCount(next, need);
  else if (countLeaves(next) > need) next = shrinkLayoutToCount(next, need);

  const paneIds = collectPaneIds(next);
  const idMap: Record<string, string> = {};
  for (let i = 0; i < oldLeaves.length; i += 1) {
    const prev = oldLeaves[i];
    const paneId = paneIds[i];
    if (!prev || !paneId) continue;
    next = setLeafContents(next, paneId, prev);
    if (prev.paneId !== paneId) idMap[paneId] = prev.paneId;
  }
  if (Object.keys(idMap).length) next = remapLeafPaneIds(next, idMap);
  return clampLayoutRatios(next);
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

/** Welcome / onboarding layouts — browser rules are fixed per grid preset. */
export function buildWelcomeLayout(grid: GridPreset): SplitNode {
  if (grid === 4) return buildCreateLayout(4, true);
  if (grid === 8) {
    const layout = buildGridLayout(8);
    const ids = collectPaneIds(layout);
    const browserPane = ids[WELCOME_BROWSER_CELL_INDEX];
    if (!browserPane) return layout;
    return mapLeaves(layout, (leaf) =>
      leaf.paneId === browserPane
        ? { ...createBrowserLeaf(), paneId: leaf.paneId }
        : leaf,
    );
  }
  return buildGridLayout(grid);
}

/** Index of the embedded browser cell in the 8-pane grid. */
export const WELCOME_BROWSER_CELL_INDEX = 3;

/** New space: 1/2/4/8 terminals, optional full-height browser column on the right. */
export function buildCreateLayout(grid: GridPreset, withBrowser: boolean): SplitNode {
  const terminals = equalizeLayout(buildGridLayout(grid));
  if (!withBrowser) return clampLayoutRatios(terminals);
  return clampLayoutRatios({
    type: "split",
    id: uid("split"),
    direction: "h",
    // Terminals keep most of the width; browser gets a stable right column.
    ratio: grid >= 4 ? 0.68 : 0.58,
    first: terminals,
    second: createLeaf(null, "browser"),
  });
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
