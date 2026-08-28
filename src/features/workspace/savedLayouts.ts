import type { Accent, PaneKind, SplitDirection, SplitNode, TerminalSession, Workspace } from "@/lib/types";
import { uid } from "@/lib/constants";
import {
  BROWSER_TAB,
  createBrowserLeaf,
  createLeaf,
  leafHasBrowser,
  leafTabIds,
  leafTabOrder,
  type LeafNode,
} from "@/features/workspace/layout";

export type SavedShellSpec = {
  title: string;
  command?: string;
  accent?: Accent;
};

export type SavedPaneSpec = {
  kind: PaneKind;
  browserUrl?: string | null;
  shells: SavedShellSpec[];
  /** Session ids replaced by shells on restore; `"__browser__"` = browser tab. */
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

  return {
    type: "leaf",
    spec: {
      kind,
      browserUrl: leafHasBrowser(node) ? node.browserUrl : null,
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
  const hasBrowser = spec.browserUrl !== undefined && spec.browserUrl !== null;
  const base = hasBrowser ? createBrowserLeaf(spec.browserUrl ?? "") : createLeaf(null, "terminal", null);
  const tabOrder = spec.tabOrder?.length
    ? spec.tabOrder.map((id) => (id === BROWSER_TAB ? BROWSER_TAB : id))
    : hasBrowser
      ? [BROWSER_TAB]
      : [];

  const leaf: LeafNode = {
    ...base,
    paneId,
    kind: hasBrowser && !spec.shells.length ? "browser" : spec.kind,
    sessionId: null,
    sessionIds: [],
    browserUrl: hasBrowser ? (spec.browserUrl ?? "") : null,
    tabOrder: tabOrder.filter((id) => id === BROWSER_TAB || spec.shells.length > 0),
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
