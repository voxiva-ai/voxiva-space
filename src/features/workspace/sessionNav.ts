/** Closed-tab / focus navigation stacks (⌘⇧T, ⌘[, ⌘]). */

export type ClosedSurface =
  | {
      kind: "terminal";
      workspaceId: string;
      title: string;
      cwd: string;
      shell?: string;
      agentId?: string;
      command?: string;
    }
  | {
      kind: "browser";
      workspaceId: string;
      url: string;
    }
  | {
      kind: "workspace";
      name: string;
      cwd: string;
      color?: string;
      pinned?: boolean;
    };

export type FocusPoint = {
  workspaceId: string;
  paneId: string | null;
};

const CLOSED_CAP = 40;
const FOCUS_CAP = 48;

export function pushClosed(stack: ClosedSurface[], item: ClosedSurface): ClosedSurface[] {
  return [...stack, item].slice(-CLOSED_CAP);
}

export function popClosed(stack: ClosedSurface[]): {
  next: ClosedSurface[];
  item: ClosedSurface | null;
} {
  if (!stack.length) return { next: stack, item: null };
  const item = stack[stack.length - 1]!;
  return { next: stack.slice(0, -1), item };
}

export function sameFocus(a: FocusPoint, b: FocusPoint) {
  return a.workspaceId === b.workspaceId && a.paneId === b.paneId;
}

/** Append a focus point; truncates forward branch like a browser. */
export function pushFocus(
  trail: FocusPoint[],
  index: number,
  point: FocusPoint,
): { trail: FocusPoint[]; index: number } {
  const head = trail.slice(0, index + 1);
  const last = head[head.length - 1];
  if (last && sameFocus(last, point)) {
    return { trail: head, index: head.length - 1 };
  }
  const next = [...head, point].slice(-FOCUS_CAP);
  return { trail: next, index: next.length - 1 };
}

export function focusBack(trail: FocusPoint[], index: number) {
  if (index <= 0) return null;
  return { index: index - 1, point: trail[index - 1]! };
}

export function focusForward(trail: FocusPoint[], index: number) {
  if (index >= trail.length - 1) return null;
  return { index: index + 1, point: trail[index + 1]! };
}
