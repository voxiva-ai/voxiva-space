import type { DropZone } from "@/features/workspace/layout";

export function dropZoneAt(rect: DOMRect, clientX: number, clientY: number): DropZone {
  const rx = (clientX - rect.left) / Math.max(1, rect.width);
  const ry = (clientY - rect.top) / Math.max(1, rect.height);
  const edgeX = Math.min(rx, 1 - rx);
  const edgeY = Math.min(ry, 1 - ry);
  if (Math.min(edgeX, edgeY) > 0.22) return "center";
  if (edgeX < edgeY) return rx < 0.5 ? "left" : "right";
  return ry < 0.5 ? "top" : "bottom";
}

export function emitPaneDrag(active: boolean) {
  window.dispatchEvent(new CustomEvent("voxiva-pane-drag", { detail: { active } }));
}
