import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { Accent, AgentRun, PaneKind, SplitNode, Workspace } from "@/lib/types";
import {
  MEDIA_TAB,
  activeBrowserTab,
  findLeaf,
  isBrowserTabKey,
  leafTabOrder,
  makeBrowserTabKey,
  normalizeBrowserTabs,
  type SnapLayoutId,
  type DropZone,
} from "@/features/workspace/layout";
import {
  clearFileDropPaint,
  clearPaneDropClasses,
  dropZoneAt,
  dropZoneLabelKey,
  emitPaneDrag,
  isExternalFileDrag,
  markPaneDrop,
  resolveFileDropZone,
  syncFileDropPaint,
} from "@/features/workspace/paneDropOverlay";
import { useWorkspaceFileDrop } from "@/features/workspace/useWorkspaceFileDrop";
import {
  bracketedFilePayload,
  isPanePreviewMime,
  isPreviewDropPath,
  payloadFromHtml5FileDrop,
  relPathFromWorkspace,
} from "@/features/workspace/workspaceFileDrop";
import { getWorkspaceFileInfo } from "@/features/editor/api";
import { MediaPreview } from "@/features/editor/MediaPreview";
import { MaterialFileIcon } from "@/features/editor/MaterialFileIcon";
import {
  isImagePath,
} from "@/features/editor/types";
import { saveBlobToTemp } from "@/features/terminal/paste";
import { TerminalPane } from "@/features/terminal";
import { enqueueTerminalSpawn, yieldToUi } from "@/features/terminal/spawnQueue";
import { NativeBrowser, type BrowserTabMeta } from "@/features/browser/NativeBrowser";
import { browserFaviconUrl, prettyBrowserLabel } from "@/features/browser/tabMeta";
import { readAgentDrag, isAgentDrag, endAgentDragSession, type AgentDragPayload } from "@/features/agents/drag";
import { agentBots, resolveBotCommand, resumeCommandFor } from "@/features/agents/bots";
import { PaneActions } from "@/features/workspace/PaneActions";
import { PaneContextMenu, type PaneMenuState } from "@/features/workspace/PaneContextMenu";
import { useSpace } from "@/features/workspace/SpaceContext";
import { IconBrowser, IconGrip, IconX } from "@/components/icons";
import { ShellTabIcon } from "@/components/shell/ShellTabIcon";

function mediaKindForPath(path: string): "image" | "binary" {
  return isImagePath(path) ? "image" : "binary";
}

function mediaTabTitle(path: string) {
  return path.split(/[/\\]/).pop() || path;
}

function runFromDragPayload(
  payload: AgentDragPayload,
  workspace: Workspace | null | undefined,
  workspaces: Workspace[],
): AgentRun | null {
  const workspaceId = payload.workspaceId || workspace?.id;
  if (!workspaceId) return null;
  const ws = workspaces.find((item) => item.id === workspaceId) ?? workspace;
  const bot = agentBots.find((b) => b.id === payload.agentId);
  return {
    id: payload.runId || `drag-${payload.agentId}`,
    agentId: payload.agentId,
    agentName: payload.agentName,
    workspaceId,
    workspaceName: ws?.name ?? "",
    cwd: ws?.cwd ?? "",
    command: payload.command ?? bot?.command,
    shell: payload.shell ?? null,
    accent: (payload.accent as Accent | undefined) ?? bot?.accent ?? "green",
    at: Date.now(),
    sessionId: payload.sessionId,
    paneId: payload.paneId,
  };
}

function mimeFromPath(path: string) {
  const ext = path.split(/[/\\]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    ico: "image/x-icon",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    ogv: "video/ogg",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
    opus: "audio/opus",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
  };
  return map[ext] ?? "application/octet-stream";
}

function PaneMediaPreview({ absPath }: { paneId: string; absPath: string }) {
  const { activeWorkspace } = useSpace();
  const [info, setInfo] = useState<{
    path: string;
    mime: string;
    kind: "image" | "binary";
    absPath: string;
    size?: number;
  } | null>(null);

  useEffect(() => {
    if (!activeWorkspace) return;
    const rel = relPathFromWorkspace(activeWorkspace.cwd, absPath);
    const name = absPath.split(/[/\\]/).pop() || "file";
    if (rel !== null) {
      void getWorkspaceFileInfo(activeWorkspace.cwd, rel)
        .then((file) => {
          setInfo({
            path: file.path,
            mime: file.mime,
            kind: mediaKindForPath(file.path),
            absPath: file.absolutePath,
            size: file.size,
          });
        })
        .catch(() => {
          setInfo({
            path: name,
            mime: mimeFromPath(name),
            kind: mediaKindForPath(name),
            absPath,
          });
        });
      return;
    }
    setInfo({
      path: name,
      mime: mimeFromPath(name),
      kind: mediaKindForPath(name),
      absPath,
    });
  }, [absPath, activeWorkspace]);

  if (!info) {
    return (
      <div className="vs-paneMedia is-loading">
        <div className="vs-paneLoader" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className="vs-paneMedia">
      <MediaPreview
        path={info.path}
        mime={info.mime}
        kind={info.kind}
        size={info.size}
        workspaceRoot={activeWorkspace?.cwd}
        absPath={info.absPath}
        chrome="pane"
      />
    </div>
  );
}

function BrowserTabIcon({ url, pageFavicon }: { url: string; pageFavicon?: string | null }) {
  const src = browserFaviconUrl(url, pageFavicon);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  if (!src || failed) {
    return <IconBrowser size={11} className="vs-paneTabIcon" />;
  }
  return (
    <img
      className="vs-paneTabFavicon"
      src={src}
      alt=""
      width={12}
      height={12}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function TabGlyph({ children }: { children: ReactNode }) {
  return (
    <span className="vs-paneTabGlyph" aria-hidden>
      {children}
    </span>
  );
}

function PaneLeaf({
  paneId,
  kind,
  sessionId,
  sessionIds,
  tabOrder,
  browserUrl,
  browserTabs,
  activeBrowserId,
  mediaPath,
}: {
  paneId: string;
  kind: PaneKind;
  sessionId: string | null;
  sessionIds?: string[];
  tabOrder?: string[];
  browserUrl: string | null;
  browserTabs?: { id: string; url: string }[];
  activeBrowserId?: string | null;
  mediaPath?: string | null;
}) {
  const {
    activeWorkspace,
    sessions,
    agentRuns,
    agentAvailability,
    workspaces,
    focusPane,
    spawnInPane,
    launchAgent,
    resumeAgentRunAtDrop,
    takePendingPaneSpawnQueue,
    clearPendingPaneSpawn,
    shouldAutoSpawnShell,
    emptyPaneSpawnEpoch,
    closePaneSurface,
    renameSession,
    activatePaneSession,
    focusBrowserInPane,
    focusMediaInPane,
    placePaneTab,
    dockPaneTab,
    snapDragToLayout,
    restartSession,
    setPaneBrowserUrl,
    dockPane,
    handleFileDropAt,
    flashPaneId,
    t,
  } = useSpace();
  const focused = activeWorkspace?.focusedPaneId === paneId;
  const tabIds =
    sessionIds && sessionIds.length
      ? sessionIds
      : sessionId
        ? [sessionId]
        : [];
  const activeId = sessionId && tabIds.includes(sessionId) ? sessionId : tabIds[0] ?? null;
  const leafSnapshot = useMemo(
    () => ({
      type: "leaf" as const,
      paneId,
      kind,
      sessionId,
      sessionIds: tabIds,
      tabOrder,
      browserUrl,
      browserTabs,
      activeBrowserId,
      mediaPath: mediaPath ?? null,
    }),
    [activeBrowserId, browserTabs, browserUrl, kind, mediaPath, paneId, sessionId, tabIds, tabOrder],
  );
  const browsers = useMemo(() => normalizeBrowserTabs(leafSnapshot), [leafSnapshot]);
  const activeBrowser = useMemo(() => activeBrowserTab(leafSnapshot), [leafSnapshot]);
  const hasBrowser = browsers.length > 0;
  const hasMedia = Boolean(mediaPath);
  const browserActive = kind === "browser" && hasBrowser;
  const mediaActive = kind === "media" && hasMedia;
  const activeBrowserKey = activeBrowser ? makeBrowserTabKey(activeBrowser.id) : null;
  const surfaceOrder = useMemo(() => leafTabOrder(leafSnapshot), [leafSnapshot]);
  const anyAttention = tabIds.some((id) => sessions[id]?.needsAttention);
  const spawning = useRef(false);
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() =>
    activeId ? new Set([activeId]) : new Set(),
  );
  const tabsStripRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<PaneMenuState>(null);
  const [browserMetaById, setBrowserMetaById] = useState<Record<string, BrowserTabMeta>>({});
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const suppressTabClickRef = useRef(false);
  const hasChrome = tabIds.length > 0 || hasBrowser || hasMedia;

  useEffect(() => {
    if (!activeId) return;
    setMountedTabs((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  const beginTabDrag = (tabKey: string, event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest(".vs-paneTabClose, input, [data-no-tab-drag]")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    let insertBefore: string | null | undefined;
    let overPane: string | null = null;
    let overZone: DropZone | null = null;
    let overSnap: string | null = null;
    const beforeIdInStrip = (strip: HTMLElement, clientX: number): string | null => {
      const tabs = [...strip.querySelectorAll<HTMLElement>("[data-tab-key]")];
      for (const tab of tabs) {
        const key = tab.getAttribute("data-tab-key");
        if (!key || key === tabKey) continue;
        const rect = tab.getBoundingClientRect();
        if (clientX < rect.left + rect.width / 2) return key;
      }
      return null;
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (
        !active &&
        (Math.abs(moveEvent.clientX - startX) > 4 || Math.abs(moveEvent.clientY - startY) > 4)
      ) {
        active = true;
        setDraggingTab(tabKey);
        emitPaneDrag(true, "tab");
        document.body.classList.add("is-tab-dragging");
      }
      if (!active) return;

      const strip = tabsStripRef.current;
      if (strip) {
        const rect = strip.getBoundingClientRect();
        const edge = 28;
        if (moveEvent.clientX < rect.left + edge) strip.scrollLeft -= 14;
        else if (moveEvent.clientX > rect.right - edge) strip.scrollLeft += 14;
      }

      clearPaneDropClasses();
      insertBefore = undefined;
      overPane = null;
      overZone = null;
      overSnap = null;
      setDragOverTab(null);

      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      if (!el) return;

      // Prefer layout snap targets while the floating bar is open.
      const snap = el.closest("[data-snap-layout]") as HTMLElement | null;
      if (snap) {
        snap.classList.add("is-dropTarget");
        overSnap = snap.getAttribute("data-snap-layout");
        return;
      }

      const bar = el.closest(".vs-paneTabBar, .vs-paneTabs") as HTMLElement | null;
      const stripEl = (bar?.classList.contains("vs-paneTabs") ? bar : bar?.querySelector(".vs-paneTabs")) as
        | HTMLElement
        | null;
      const stripPane = stripEl?.closest("[data-pane-id]") as HTMLElement | null;
      const stripPaneId = stripPane?.getAttribute("data-pane-id");

      if (stripEl && stripPaneId) {
        if (stripPaneId === paneId) {
          const beforeId = beforeIdInStrip(stripEl, moveEvent.clientX);
          insertBefore = beforeId;
          setDragOverTab(beforeId ?? "__end__");
          return;
        }
        overPane = stripPaneId;
        overZone = "center";
        markPaneDrop(stripPane!, "center", {
          asTabMerge: true,
          hint: t(dropZoneLabelKey("center")),
        });
        return;
      }

      const targetPane = el.closest("[data-pane-id]") as HTMLElement | null;
      const targetId = targetPane?.getAttribute("data-pane-id");
      if (!targetPane || !targetId) return;

      const zone = dropZoneAt(
        targetPane.getBoundingClientRect(),
        moveEvent.clientX,
        moveEvent.clientY,
      );

      if (targetId === paneId) {
        if (zone === "center" || surfaceOrder.length < 2) return;
        overPane = targetId;
        overZone = zone;
        markPaneDrop(targetPane, zone, {
          asTabMerge: false,
          hint: t(dropZoneLabelKey(zone)),
        });
        return;
      }

      overPane = targetId;
      overZone = zone;
      markPaneDrop(targetPane, zone, {
        asTabMerge: zone === "center",
        hint: t(dropZoneLabelKey(zone)),
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      clearPaneDropClasses();
      document.body.classList.remove("is-tab-dragging");
      if (active) {
        suppressTabClickRef.current = true;
        emitPaneDrag(false);
        if (overSnap) {
          snapDragToLayout(overSnap as SnapLayoutId, paneId, tabKey);
        } else if (insertBefore !== undefined) {
          placePaneTab(paneId, tabKey, insertBefore);
        } else if (overPane && overZone) {
          dockPaneTab(paneId, overPane, tabKey, overZone);
        }
      }
      setDraggingTab(null);
      setDragOverTab(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onTabActivate = (action: () => void) => {
    if (suppressTabClickRef.current) {
      suppressTabClickRef.current = false;
      return;
    }
    action();
  };

  // Drop stale meta when a browser tab disappears.
  useEffect(() => {
    const ids = new Set(browsers.map((b) => b.id));
    setBrowserMetaById((prev) => {
      let changed = false;
      const next: Record<string, BrowserTabMeta> = {};
      for (const [id, meta] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = meta;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [browsers]);

  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  useEffect(() => {
    const onRenameFocused = () => {
      if (!focused || !activeId) return;
      setRenameDraft(sessions[activeId]?.title ?? "Shell");
      setRenamingId(activeId);
    };
    window.addEventListener("voxiva-rename-focused-tab", onRenameFocused);
    return () => window.removeEventListener("voxiva-rename-focused-tab", onRenameFocused);
  }, [activeId, focused, sessions]);

  const commitRename = () => {
    if (!renamingId) return;
    renameSession(renamingId, renameDraft);
    setRenamingId(null);
  };

  // Empty terminal pane → spawn Shell. Browser / media-only / held → leave as-is.
  useEffect(() => {
    if (hasBrowser || hasMedia || tabIds.length > 0) {
      spawning.current = false;
      return;
    }
    if (!activeWorkspace || spawning.current) return;
    if (!shouldAutoSpawnShell(paneId)) {
      spawning.current = false;
      return;
    }
    spawning.current = true;
    void enqueueTerminalSpawn(async () => {
      await yieldToUi(0);
      // Re-check after yield — resume/hold may have claimed this pane.
      if (!shouldAutoSpawnShell(paneId)) {
        spawning.current = false;
        return null;
      }
      const queue = takePendingPaneSpawnQueue(paneId);
      let lastId: string | null = null;
      const items =
        queue.length > 0
          ? queue
          : [{ title: "Shell", accent: "green" as const, paneId, mode: "replace" as const }];
      for (let i = 0; i < items.length; i++) {
        if (i > 0) await yieldToUi(40);
        if (!shouldAutoSpawnShell(paneId) && i === 0 && queue.length === 0) {
          spawning.current = false;
          return null;
        }
        lastId = await spawnInPane({
          title: items[i]!.title ?? "Shell",
          command: items[i]!.command,
          accent: items[i]!.accent ?? "green",
          agentId: items[i]!.agentId,
          paneId,
          mode: i === 0 ? "replace" : "tab",
          paste: items[i]!.paste,
          shell: items[i]!.shell,
          workspaceId: items[i]!.workspaceId,
        });
      }
      return lastId;
    }).then((id) => {
      if (id) clearPendingPaneSpawn(paneId);
      else spawning.current = false;
    });
  }, [
    hasBrowser,
    hasMedia,
    tabIds.length,
    activeWorkspace,
    paneId,
    spawnInPane,
    takePendingPaneSpawnQueue,
    clearPendingPaneSpawn,
    shouldAutoSpawnShell,
    emptyPaneSpawnEpoch,
  ]);

  return (
    <div
      className={`vs-pane${focused ? " is-focused" : ""}${anyAttention ? " is-attention" : ""}${
        flashPaneId === paneId ? " is-flash" : ""
      }`}
      data-pane-id={paneId}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, a, [data-no-ctx]")) return;
        event.preventDefault();
        focusPane(paneId);
        const tabKey =
          (event.target as HTMLElement).closest("[data-tab-key]")?.getAttribute("data-tab-key") ??
          null;
        const onBrowser = tabKey ? isBrowserTabKey(tabKey) : browserActive;
        setMenu({
          paneId,
          x: event.clientX,
          y: event.clientY,
          isBrowser: onBrowser,
          sessionId:
            tabKey && !isBrowserTabKey(tabKey) && tabKey !== MEDIA_TAB
              ? tabKey
              : tabKey && (isBrowserTabKey(tabKey) || tabKey === MEDIA_TAB)
                ? null
                : activeId,
          tabId:
            tabKey ??
            (mediaActive
              ? MEDIA_TAB
              : browserActive && activeBrowserKey
                ? activeBrowserKey
                : activeId),
        });
      }}
      onMouseDown={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "[data-no-drag], [data-tab-key], .vs-paneTabs, .vs-paneTabClose",
          )
        ) {
          focusPane(paneId);
          return;
        }
        const handle = (event.target as HTMLElement).closest("[data-pane-drag]");
        if (!handle) {
          focusPane(paneId);
          return;
        }

        event.preventDefault();
        focusPane(paneId);
        const fromId = handle.getAttribute("data-pane-drag") || paneId;
        emitPaneDrag(true);

        const onMove = (moveEvent: MouseEvent) => {
          clearPaneDropClasses();
          const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const snap = el?.closest("[data-snap-layout]") as HTMLElement | null;
          if (snap) {
            snap.classList.add("is-dropTarget");
            return;
          }
          const target = el?.closest("[data-pane-id]") as HTMLElement | null;
          const toId = target?.getAttribute("data-pane-id");
          if (toId && toId !== fromId && target) {
            markPaneDrop(
              target,
              dropZoneAt(target.getBoundingClientRect(), moveEvent.clientX, moveEvent.clientY),
              { asTabMerge: false },
            );
          }
        };

        const onUp = (upEvent: MouseEvent) => {
          window.removeEventListener("mouseup", onUp);
          window.removeEventListener("mousemove", onMove);
          clearPaneDropClasses();

          const el = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
          const snap = el?.closest("[data-snap-layout]") as HTMLElement | null;
          const snapId = snap?.getAttribute("data-snap-layout");
          emitPaneDrag(false);
          if (snapId) {
            snapDragToLayout(snapId as SnapLayoutId, fromId);
            return;
          }

          const target = el?.closest("[data-pane-id]") as HTMLElement | null;
          const toId = target?.getAttribute("data-pane-id");
          if (toId && toId !== fromId && target) {
            dockPane(
              fromId,
              toId,
              dropZoneAt(target.getBoundingClientRect(), upEvent.clientX, upEvent.clientY),
            );
          }
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }}
      onDragEnter={(event) => {
        if (isAgentDrag(event.dataTransfer)) {
          event.preventDefault();
          return;
        }
        if (!isExternalFileDrag(event.dataTransfer.types)) return;
        event.preventDefault();
        emitPaneDrag(true, "file");
      }}
      onDragOver={(event) => {
        if (isAgentDrag(event.dataTransfer)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          const zone = dropZoneAt(
            event.currentTarget.getBoundingClientRect(),
            event.clientX,
            event.clientY,
          );
          markPaneDrop(event.currentTarget, zone, {
            asTabMerge: zone === "center",
            hint: t(dropZoneLabelKey(zone)),
          });
          return;
        }
        if (!isExternalFileDrag(event.dataTransfer.types)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        emitPaneDrag(true, "file");
        syncFileDropPaint(event.clientX, event.clientY, t);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        clearFileDropPaint();
      }}
      onDrop={(event) => {
        const agentPayload = readAgentDrag(event.dataTransfer);
        if (agentPayload || isAgentDrag(event.dataTransfer)) {
          if (!agentPayload) return;
          event.preventDefault();
          event.stopPropagation();
          clearPaneDropClasses();
          emitPaneDrag(false);
          endAgentDragSession();
          focusPane(paneId);
          const zone = dropZoneAt(
            event.currentTarget.getBoundingClientRect(),
            event.clientX,
            event.clientY,
          );
          if (agentPayload.runId) {
            const run =
              agentRuns.find((item) => item.id === agentPayload.runId) ??
              runFromDragPayload(agentPayload, activeWorkspace, workspaces);
            if (run) {
              void resumeAgentRunAtDrop(run, paneId, zone);
              return;
            }
          }
          if (
            agentPayload.live &&
            agentPayload.sessionId &&
            agentPayload.paneId &&
            agentPayload.workspaceId === activeWorkspace?.id
          ) {
            if (agentPayload.paneId === paneId && zone === "center") {
              activatePaneSession(paneId, agentPayload.sessionId);
              return;
            }
            dockPaneTab(agentPayload.paneId, paneId, agentPayload.sessionId, zone);
            return;
          }
          const bot = agentBots.find((b) => b.id === agentPayload.agentId);
          const command =
            bot && !agentPayload.runId
              ? resolveBotCommand(bot, agentAvailability) || agentPayload.command
              : resumeCommandFor(bot, agentPayload.command, agentAvailability) ??
                agentPayload.command;
          void launchAgent({
            title: agentPayload.agentName,
            agentId: agentPayload.agentId,
            command,
            shell: agentPayload.shell,
            accent: agentPayload.accent as Accent | undefined,
            paneId,
            forceNew: true,
            mode: "tab",
          }).then((id) => {
            if (id && zone !== "center") dockPaneTab(paneId, paneId, id, zone);
          });
          return;
        }
        if (isExternalFileDrag(event.dataTransfer.types)) {
          event.preventDefault();
          event.stopPropagation();
          clearFileDropPaint();
          emitPaneDrag(false, "file");
          focusPane(paneId);
          const zone = resolveFileDropZone(
            event.currentTarget,
            event.clientX,
            event.clientY,
          );
          if (zone === "chat") return;
          void (async () => {
            const files = event.dataTransfer.files;
            if (files?.length) {
              for (const file of Array.from(files)) {
                const anyFile = file as File & { path?: string };
                const diskPath = anyFile.path?.trim();
                if (diskPath && isPreviewDropPath(diskPath)) {
                  void handleFileDropAt(paneId, zone, "", {
                    shiftKey: event.shiftKey,
                    rawPaths: [diskPath],
                  });
                  return;
                }
                if (
                  !diskPath &&
                  (isPanePreviewMime(file.type) || isPreviewDropPath(file.name))
                ) {
                  const temp = await saveBlobToTemp(file, file.name);
                  if (temp) {
                    void handleFileDropAt(paneId, zone, "", {
                      shiftKey: event.shiftKey,
                      rawPaths: [temp],
                    });
                    return;
                  }
                }
              }
            }
            const payload = await payloadFromHtml5FileDrop(event.dataTransfer, {
              cwd: activeWorkspace?.cwd || null,
            });
            if (!payload) return;
            const paths = files?.length
              ? Array.from(files).map((f) => {
                  const anyFile = f as File & { path?: string };
                  return anyFile.path || f.name;
                })
              : undefined;
            void handleFileDropAt(paneId, zone, bracketedFilePayload(payload), {
              shiftKey: event.shiftKey,
              rawPaths: paths,
            });
          })();
        }
      }}
    >
      {hasChrome ? (
        <div className="vs-paneTerminalStack">
          <div className="vs-paneTabBar">
            <span className="vs-dragHandle" data-pane-drag={paneId} title={t("term.drag")} aria-hidden>
              <IconGrip size={14} />
            </span>
            <div
              className={`vs-paneTabs${dragOverTab === "__end__" ? " is-drop-end" : ""}`}
              role="tablist"
              data-no-drag
              ref={tabsStripRef}
            >
              {surfaceOrder.map((key) => {
                if (isBrowserTabKey(key)) {
                  const tab = browsers.find((b) => makeBrowserTabKey(b.id) === key);
                  if (!tab) return null;
                  const meta = browserMetaById[tab.id];
                  const label =
                    prettyBrowserLabel(tab.url || "", meta?.title) || t("nav.browser");
                  const selected = browserActive && activeBrowserKey === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      data-tab-key={key}
                      aria-selected={selected}
                      title={label}
                      className={`vs-paneTab${selected ? " is-active" : ""}${
                        draggingTab === key ? " is-dragging" : ""
                      }${dragOverTab === key ? " is-drop" : ""}`}
                      onPointerDown={(e) => beginTabDrag(key, e)}
                      onClick={() =>
                        onTabActivate(() => {
                          focusBrowserInPane(paneId, key);
                          focusPane(paneId);
                        })
                      }
                    >
                      <TabGlyph>
                        {(tab.url || "").trim() ? (
                          <BrowserTabIcon url={tab.url || ""} pageFavicon={meta?.favicon} />
                        ) : (
                          <IconBrowser size={11} className="vs-paneTabIcon" />
                        )}
                      </TabGlyph>
                      <span className="vs-paneTabLabel">{label}</span>
                      <span
                        className="vs-paneTabClose"
                        role="button"
                        tabIndex={0}
                        title={t("term.closeTab")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void closePaneSurface(paneId, key);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            void closePaneSurface(paneId, key);
                          }
                        }}
                      >
                        <IconX size={11} />
                      </span>
                    </button>
                  );
                }

                if (key === MEDIA_TAB && mediaPath) {
                  const label = mediaTabTitle(mediaPath);
                  return (
                    <button
                      key={MEDIA_TAB}
                      type="button"
                      role="tab"
                      data-tab-key={MEDIA_TAB}
                      aria-selected={mediaActive}
                      title={label}
                      className={`vs-paneTab${mediaActive ? " is-active" : ""}${
                        draggingTab === MEDIA_TAB ? " is-dragging" : ""
                      }${dragOverTab === MEDIA_TAB ? " is-drop" : ""}`}
                      onPointerDown={(e) => beginTabDrag(MEDIA_TAB, e)}
                      onClick={() =>
                        onTabActivate(() => {
                          focusMediaInPane(paneId);
                          focusPane(paneId);
                        })
                      }
                    >
                      <TabGlyph>
                        <MaterialFileIcon name={label} isDir={false} size={14} className="vs-paneTabIcon" />
                      </TabGlyph>
                      <span className="vs-paneTabLabel">{label}</span>
                      <span
                        className="vs-paneTabClose"
                        role="button"
                        tabIndex={0}
                        title={t("term.closeTab")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void closePaneSurface(paneId, MEDIA_TAB);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            void closePaneSurface(paneId, MEDIA_TAB);
                          }
                        }}
                      >
                        <IconX size={11} />
                      </span>
                    </button>
                  );
                }

                const s = sessions[key];
                if (!s) return null;
                const renaming = renamingId === key;
                const active = !browserActive && !mediaActive && key === activeId;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    data-tab-key={key}
                    aria-selected={active}
                    className={`vs-paneTab${active ? " is-active" : ""}${
                      s.needsAttention ? " is-attention" : ""
                    }${draggingTab === key ? " is-dragging" : ""}${
                      dragOverTab === key ? " is-drop" : ""
                    }`}
                    onPointerDown={(e) => beginTabDrag(key, e)}
                    onClick={() =>
                      onTabActivate(() => {
                        if (renaming) return;
                        activatePaneSession(paneId, key);
                        focusPane(paneId);
                      })
                    }
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenamingId(key);
                      setRenameDraft(s.title);
                    }}
                  >
                    <TabGlyph>
                      <ShellTabIcon shell={s.shell} size={12} className="vs-paneTabIcon" />
                    </TabGlyph>
                    {renaming ? (
                      <input
                        ref={renameInputRef}
                        className="vs-paneTabRename"
                        data-no-tab-drag
                        value={renameDraft}
                        aria-label={t("term.rename")}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setRenamingId(null);
                          }
                        }}
                      />
                    ) : (
                      <span className="vs-paneTabLabel" title={t("term.renameHint")}>
                        {s.title}
                      </span>
                    )}
                    <span
                      className="vs-paneTabClose"
                      role="button"
                      tabIndex={0}
                      title={t("term.closeTab")}
                      onClick={(e) => {
                        e.stopPropagation();
                        void closePaneSurface(paneId, key);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          void closePaneSurface(paneId, key);
                        }
                      }}
                    >
                      <IconX size={11} />
                    </span>
                  </button>
                );
              })}
            </div>
            <PaneActions
              paneId={paneId}
              sessionId={browserActive || mediaActive ? null : activeId}
              isBrowser={browserActive}
            />
          </div>
          <div className="vs-paneTabBodies">
            {browsers.map((tab) => {
              const key = makeBrowserTabKey(tab.id);
              const visible = browserActive && activeBrowser?.id === tab.id;
              return (
                <div
                  key={key}
                  className={`vs-paneTabBody${visible ? " is-visible" : ""}`}
                  hidden={!visible}
                >
                  <NativeBrowser
                    compact
                    active={Boolean(focused && visible)}
                    dragPaneId={paneId}
                    instanceId={`${paneId}-${tab.id}`}
                    url={tab.url || ""}
                    onUrlChange={(url) => setPaneBrowserUrl(paneId, url, key)}
                    onMetaChange={(meta) =>
                      setBrowserMetaById((prev) => ({ ...prev, [tab.id]: meta }))
                    }
                    onClose={() => void closePaneSurface(paneId, key)}
                  />
                </div>
              );
            })}
            {hasMedia && mediaPath ? (
              <div
                className={`vs-paneTabBody${mediaActive ? " is-visible" : ""}`}
                hidden={!mediaActive}
              >
                <PaneMediaPreview paneId={paneId} absPath={mediaPath} />
              </div>
            ) : null}
            {tabIds.map((id) => {
              const s = sessions[id];
              if (!s || !mountedTabs.has(id)) return null;
              const visible = !browserActive && !mediaActive && id === activeId;
              return (
                <div
                  key={id}
                  className={`vs-paneTabBody${visible ? " is-visible" : ""}`}
                  hidden={!visible}
                >
        <TerminalPane
                    isActive={focused && visible}
                    session={s}
          paneId={paneId}
                    chrome="body"
          onFocus={() => {
            if (!focused) focusPane(paneId);
          }}
                    onClose={() => void closePaneSurface(paneId, s.id)}
                    onRestart={() => void restartSession(s.id)}
        />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="vs-paneEmpty">
          <div className="vs-paneLoader" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <h3>{t("term.starting")}</h3>
          <p>{t("term.startingHint")}</p>
        </div>
      )}
      <PaneContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

function SplitView({ node }: { node: SplitNode }) {
  const { setSplitRatio } = useSpace();
  const [liveRatio, setLiveRatio] = useState<number | null>(null);

  if (node.type === "leaf") {
    return (
      <PaneLeaf
        paneId={node.paneId}
        kind={node.kind ?? "terminal"}
        sessionId={node.sessionId}
        sessionIds={node.sessionIds}
        tabOrder={node.tabOrder}
        browserUrl={node.browserUrl ?? null}
        browserTabs={node.browserTabs}
        activeBrowserId={node.activeBrowserId}
        mediaPath={node.mediaPath ?? null}
      />
    );
  }

  const baseRatio = Math.min(0.78, Math.max(0.22, Number.isFinite(node.ratio) ? node.ratio : 0.5));
  const ratio = liveRatio ?? baseRatio;
  const firstStyle = {
    flexGrow: ratio,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  } as CSSProperties;
  const secondStyle = {
    flexGrow: 1 - ratio,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  } as CSSProperties;

  return (
    <div className={`vs-splitNode is-${node.direction}`}>
      <div className="vs-splitChild is-first" style={firstStyle}>
        <SplitView node={node.first} />
      </div>
      <div
        className="vs-splitDivider"
        role="separator"
        onPointerDown={(event) => {
          event.preventDefault();
          const parent = (event.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
          if (!parent) return;
          const size = node.direction === "h" ? parent.width : parent.height;
          let last = baseRatio;
          const onMove = (moveEvent: PointerEvent) => {
            const pos = node.direction === "h" ? moveEvent.clientX : moveEvent.clientY;
            last = Math.min(
              0.78,
              Math.max(0.22, (pos - (node.direction === "h" ? parent.left : parent.top)) / size),
            );
            setLiveRatio(last);
          };
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            setSplitRatio(node.id, last);
            setLiveRatio(null);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      />
      <div className="vs-splitChild is-second" style={secondStyle}>
        <SplitView node={node.second} />
      </div>
    </div>
  );
}

export function SplitGrid({ layout }: { layout: SplitNode }) {
  const { activeWorkspace, handleFileDropAt, maximizedPaneId, t } = useSpace();
  useWorkspaceFileDrop({
    cwd: activeWorkspace?.cwd || "",
    t,
    handleFileDropAt,
  });

  const maximizedLeaf = maximizedPaneId ? findLeaf(layout, maximizedPaneId) : null;

  return (
    <div className={`vs-splitRoot${maximizedLeaf ? " is-maximized" : ""}`}>
      <SplitView node={maximizedLeaf ?? layout} />
    </div>
  );
}
