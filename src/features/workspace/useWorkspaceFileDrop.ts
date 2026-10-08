import { useEffect, useRef } from "react";
import type { DropZone } from "@/features/workspace/layout";
import {
  clearFileDropPaint,
  emitPaneDrag,
  resolveDropTargetAt,
  resolveFileDropZone,
  syncFileDropPaint,
} from "@/features/workspace/paneDropOverlay";
import {
  bracketedFilePayload,
  payloadFromOsPaths,
} from "@/features/workspace/workspaceFileDrop";
import {
  ensureWorkspaceOsDropListener,
  registerWorkspaceOsDropRouter,
} from "@/features/terminal/drop";
import type { MsgKey } from "@/i18n";

type FileDropDeps = {
  cwd: string;
  t: (key: MsgKey) => string;
  handleFileDropAt: (
    paneId: string,
    zone: DropZone | "chat",
    pastePayload: string,
    opts?: { shiftKey?: boolean; rawPaths?: string[] },
  ) => Promise<void>;
};

export function useWorkspaceFileDrop({ cwd, t, handleFileDropAt }: FileDropDeps) {
  const shiftRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftRef.current = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") shiftRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    ensureWorkspaceOsDropListener();

    const paintTarget = (clientX: number, clientY: number) => {
      syncFileDropPaint(clientX, clientY, t);
    };

    registerWorkspaceOsDropRouter({
      onOver: (clientX, clientY) => {
        emitPaneDrag(true, "file");
        paintTarget(clientX, clientY);
      },
      onLeave: () => {
        clearFileDropPaint();
        emitPaneDrag(false, "file");
      },
      onDrop: (clientX, clientY, paths) => {
        clearFileDropPaint();
        emitPaneDrag(false, "file");
        const target = resolveDropTargetAt(clientX, clientY);
        if (!target?.paneId) return;
        const zone = resolveFileDropZone(target.paneEl, clientX, clientY);
        const payload = payloadFromOsPaths(paths);
        if (zone === "chat") {
          void handleFileDropAt(target.paneId, "chat", payload ?? "", {
            shiftKey: shiftRef.current,
            rawPaths: paths,
          });
          return;
        }
        if (!payload) return;
        void handleFileDropAt(target.paneId, zone, bracketedFilePayload(payload), {
          shiftKey: shiftRef.current,
          rawPaths: paths,
        });
      },
    });

    return () => registerWorkspaceOsDropRouter(null);
  }, [cwd, handleFileDropAt, t]);
}
