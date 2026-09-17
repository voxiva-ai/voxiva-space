import type { Accent, PaneKind, SplitDirection, SplitNode, TerminalSession, Workspace } from "@/lib/types";
import { uid } from "@/lib/constants";
import {
  createBrowserLeaf,
  createLeaf,
  isBrowserTabKey,
  leafHasBrowser,
  leafTabIds,
  leafTabOrder,
  makeBrowserTabKey,
  normalizeBrowserTabs,
  type LeafNode,
} from "@/features/workspace/layout";

export type SavedShellSpec = {
  title: string;
  command?: string;
  accent?: Accent;
};

export type SavedPaneSpec = {
  kind: PaneKind;
  /** @deprecated prefer browserTabs */
  browserUrl?: string | null;
  /** Count / urls of browser tabs to restore (URLs optional). */
  browserTabs?: Array<{ url?: string | null }>;
  shells: SavedShellSpec[];
  /** Session ids replaced by shells on restore; browser keys = `"__browser__:<id>"`. */
  tabOrder?: string[];
};

export type SavedLayoutNode =
  | { type: "leaf"; spec: SavedPaneSpec }
  | {
      type: "split";
      direction: SplitDirection;
      ratio: number;
      first: SavedLayoutNode;
      second: SavedLayoutNode;
    };

export type SavedWorkspaceLayout = {
  id: string;
  name: string;
  createdAt: number;
  sourceWorkspaceName?: string;
  root: SavedLayoutNode;
};

export type BuiltSavedLayout = {
  layout: SplitNode;
  spawnQueues: Map<string, SavedShellSpec[]>;
};

function captureNode(node: SplitNode, sessions: Record<string, TerminalSession>): SavedLayoutNode {
  if (node.type === "split") {
    return {
      type: "split",
      direction: node.direction,
      ratio: node.ratio,
      first: captureNode(node.first, sessions),
      second: captureNode(node.second, sessions),
    };
  }

  const shells: SavedShellSpec[] = leafTabIds(node).map((id) => {
    const session = sessions[id];
    return {
      title: session?.title ?? "Shell",
      command: session?.initialCommand,
      accent: session?.accent ?? "green",
    };
  });

  const kind = node.kind ?? "terminal";
  if (!shells.length && !leafHasBrowser(node)) {
    shells.push({ title: "Shell", accent: "green" });
  }

  const browsers = normalizeBrowserTabs(node);

  return {
    type: "leaf",
    spec: {
      kind,
      browserUrl: browsers[0]?.url ?? null,
      browserTabs: browsers.map((t) => ({ url: t.url })),
      shells,
      tabOrder: leafTabOrder(node),
    },
  };
}

export function captureWorkspaceLayout(
  workspace: Workspace,
  sessions: Record<string, TerminalSession>,
  name: string,
): SavedWorkspaceLayout {
  return {
    id: uid("layout"),
    name: name.trim() || "Layout",
    createdAt: Date.now(),
    sourceWorkspaceName: workspace.name,
    root: captureNode(workspace.layout, sessions),
  };
}

function buildLeaf(spec: SavedPaneSpec): { leaf: LeafNode; shells: SavedShellSpec[] } {
  const paneId = uid("pane");
  const browserSpecs =
    spec.browserTabs && spec.browserTabs.length
      ? spec.browserTabs
      : spec.browserUrl !== undefined && spec.browserUrl !== null
        ? [{ url: spec.browserUrl }]
        : [];
  const hasBrowser = browserSpecs.length > 0;
  const base = hasBrowser
    ? createBrowserLeaf(browserSpecs[0]?.url ?? "")
    : createLeaf(null, "terminal", null);

  const browserTabs = hasBrowser
    ? browserSpecs.map((b, i) => ({
        id: i === 0 && base.browserTabs?.[0] ? base.browserTabs[0].id : uid("b"),
        url: b.url ?? "",
      }))
    : [];

  const browserKeys = browserTabs.map((t) => makeBrowserTabKey(t.id));
  const tabOrder = (spec.tabOrder?.length ? spec.tabOrder : [...browserKeys])
    .map((id) => {
      if (!isBrowserTabKey(id)) return id;
      // Remap any legacy/single browser key onto restored browser tabs in order.
      return id;
    })
    .filter((id) => !isBrowserTabKey(id) || browserKeys.length > 0);

  // Rebuild order: keep non-browser keys + append restored browser keys.
  const nonBrowser = tabOrder.filter((id) => !isBrowserTabKey(id));
  const nextOrder = [...nonBrowser, ...browserKeys];

  const leaf: LeafNode = {
    ...base,
    paneId,
    kind: hasBrowser && !spec.shells.length ? "browser" : spec.kind,
    sessionId: null,
    sessionIds: [],
    browserUrl: hasBrowser ? (browserTabs[browserTabs.length - 1]?.url ?? "") : null,
    browserTabs: hasBrowser ? browserTabs : undefined,
    activeBrowserId: browserTabs[browserTabs.length - 1]?.id ?? null,
    tabOrder: nextOrder.filter((id) => isBrowserTabKey(id) || spec.shells.length > 0),
  };

  if (hasBrowser && spec.shells.length) {
    leaf.kind = spec.kind === "browser" ? "browser" : "terminal";
  }

  return { leaf, shells: spec.shells };
}

function walkSaved(saved: SavedLayoutNode): BuiltSavedLayout {
  const spawnQueues = new Map<string, SavedShellSpec[]>();

  function build(node: SavedLayoutNode): SplitNode {
    if (node.type === "split") {
      return {
        type: "split",
        id: uid("split"),
        direction: node.direction,
        ratio: node.ratio,
        first: build(node.first),
        second: build(node.second),
      };
    }
    const built = buildLeaf(node.spec);
    if (built.shells.length) spawnQueues.set(built.leaf.paneId, built.shells);
    return built.leaf;
  }

  return { layout: build(saved), spawnQueues };
}

export function buildLayoutFromSaved(saved: SavedWorkspaceLayout): BuiltSavedLayout {
  return walkSaved(saved.root);
}

export function savedLayoutPaneCount(saved: SavedWorkspaceLayout): number {
  let count = 0;
  const walk = (node: SavedLayoutNode) => {
    if (node.type === "leaf") count += 1;
    else {
      walk(node.first);
      walk(node.second);
    }
  };
  walk(saved.root);
  return count;
}

export function normalizeSavedLayouts(raw: unknown): SavedWorkspaceLayout[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is SavedWorkspaceLayout =>
      Boolean(
        item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.name === "string" &&
          typeof item.createdAt === "number" &&
          item.root &&
          typeof item.root === "object",
      ),
  );
}
