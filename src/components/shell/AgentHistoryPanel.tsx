import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, Folder, SearchMd } from "@untitledui/icons";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { agentBots } from "@/features/agents/bots";
import { beginAgentDragSession } from "@/features/agents/drag";
import {
  botDisplayName,
  folderLabel,
  formatRelativeTime,
  groupRunsByAgent,
  groupRunsByFolder,
  runQueryLabel,
} from "@/features/agents/history";
import { scanVaultSessions } from "@/features/vault/api";
import {
  clearPaneDropClasses,
  dropZoneLabelKey,
  emitPaneDrag,
  markPaneDrop,
  resetDragUi,
  resolveDropTargetAt,
} from "@/features/workspace/paneDropOverlay";
import { useSpace, useView, type AgentRun } from "@/features/workspace/SpaceContext";
import { findLeaf, leafTabIds, type DropZone } from "@/features/workspace/layout";
import type { VaultSession } from "@/lib/types";

function isRunLive(
  run: AgentRun,
  workspaces: ReturnType<typeof useSpace>["workspaces"],
  sessions: ReturnType<typeof useSpace>["sessions"],
) {
  if (!run.sessionId || !run.paneId) return false;
  const ws = workspaces.find((w) => w.id === run.workspaceId);
  if (!ws) return false;
  const session = sessions[run.sessionId];
  if (session?.status !== "online") return false;
  const leaf = findLeaf(ws.layout, run.paneId);
  return leaf ? leafTabIds(leaf).includes(run.sessionId) : false;
}

function vaultToRun(entry: VaultSession, workspaceId: string, workspaceName: string): AgentRun {
  const bot = agentBots.find((b) => b.id === entry.agentId);
  return {
    id: `vault:${entry.id}`,
    at: entry.mtimeMs,
    agentId: entry.agentId,
    agentName: bot?.name ?? botDisplayName(entry.agentId),
    workspaceId,
    workspaceName,
    cwd: entry.cwd,
    command: entry.resumeCommand ?? bot?.command,
    resumeCommand: entry.resumeCommand ?? undefined,
    vaultId: entry.id,
    accent: bot?.accent ?? "blue",
  };
}

type Props = {
  workspaceId?: string | null;
  compact?: boolean;
  onResume?: () => void;
};

type GroupMode = "agent" | "folder";

function ensureDragGhost(label: string) {
  let ghost = document.getElementById("vs-history-drag-ghost") as HTMLDivElement | null;
  if (!ghost) {
    ghost = document.createElement("div");
    ghost.id = "vs-history-drag-ghost";
    ghost.className = "vs-historyDragGhost";
    ghost.setAttribute("aria-hidden", "true");
    document.body.appendChild(ghost);
  }
  ghost.textContent = label;
  ghost.classList.add("is-visible");
  return ghost;
}

function moveDragGhost(clientX: number, clientY: number) {
  const ghost = document.getElementById("vs-history-drag-ghost");
  if (!ghost) return;
  ghost.style.transform = `translate3d(${clientX + 12}px, ${clientY + 10}px, 0)`;
}

function focusPaneTerminal(paneId: string) {
  const pane = document.querySelector(`[data-pane-id="${paneId}"]`);
  if (!pane) return;
  const ta = pane.querySelector(
    ".xterm-helper-textarea, .xterm textarea",
  ) as HTMLTextAreaElement | null;
  ta?.focus();
}

export function AgentHistoryPanel({
  workspaceId,
  compact = false,
  onResume,
}: Props) {
  const {
    workspaces,
    activeWorkspace,
    sessions,
    agentRuns,
    resumeAgentRun,
    resumeAgentRunAtDrop,
    locale,
    t,
  } = useSpace();
  const { setView } = useView();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("agent");
  const [scopeCurrent, setScopeCurrent] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const [vaultEntries, setVaultEntries] = useState<VaultSession[]>([]);
  const suppressClickRef = useRef(false);

  const scopeWs = workspaceId ? workspaces.find((w) => w.id === workspaceId) : activeWorkspace;
  const scopeCwd = scopeCurrent && scopeWs?.cwd ? scopeWs.cwd : null;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void scanVaultSessions({ query, cwdFilter: scopeCwd, limit: 180 })
        .then((rows) => {
          if (!cancelled) setVaultEntries(rows);
        })
        .catch(() => {
          if (!cancelled) setVaultEntries([]);
        });
    }, query.trim() ? 220 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, scopeCwd]);

  const mergedRuns = useMemo(() => {
    const local = workspaceId
      ? (agentRuns ?? []).filter((run) => run.workspaceId === workspaceId)
      : (agentRuns ?? []);

    const targetWs = scopeWs ?? activeWorkspace;
    const vaultAsRuns: AgentRun[] = vaultEntries.map((entry) =>
      vaultToRun(entry, targetWs?.id ?? "vault", targetWs?.name ?? "Vault"),
    );

    const seen = new Set(local.map((r) => `${r.agentId}:${r.cwd}:${r.at}`));
    const merged = [...local];
    for (const run of vaultAsRuns) {
      const key = `${run.agentId}:${run.cwd}:${run.at}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(run);
    }
    merged.sort((a, b) => b.at - a.at);
    return merged;
  }, [agentRuns, workspaceId, vaultEntries, scopeWs, activeWorkspace]);

  const agentGroups = useMemo(() => groupRunsByAgent(mergedRuns), [mergedRuns]);
  const folderGroups = useMemo(() => groupRunsByFolder(mergedRuns), [mergedRuns]);

  const resumeRun = (run: AgentRun) => {
    if (!resumeAgentRun) return;
    if (run.vaultId && activeWorkspace && run.workspaceId !== activeWorkspace.id) {
      const match = workspaces.find(
        (w) =>
          w.cwd.replace(/\\/g, "/").toLowerCase() === run.cwd.replace(/\\/g, "/").toLowerCase(),
      );
      if (match) {
        void resumeAgentRun({ ...run, workspaceId: match.id, workspaceName: match.name }).then(
          () => {
            setView("space");
            onResume?.();
          },
        );
        return;
      }
    }
    void resumeAgentRun(run).then(() => {
      setView("space");
      onResume?.();
    });
  };

  const toggleGroup = (key: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const beginRunDrag = (run: AgentRun, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const ws = workspaces.find((w) => w.id === run.workspaceId);
    const gone = !ws && !run.vaultId;
    if (gone) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // WebView2 may reject capture.
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const label = runQueryLabel(run, sessions);
    let active = false;
    let finished = false;
    let overPane: string | null = null;
    let overZone: DropZone | null = null;

    const finishUi = () => {
      try {
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
      resetDragUi();
      emitPaneDrag(false);
      setDraggingId(null);
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      if (
        !active &&
        (Math.abs(moveEvent.clientX - startX) > 5 || Math.abs(moveEvent.clientY - startY) > 5)
      ) {
        active = true;
        setDraggingId(run.id);
        beginAgentDragSession();
        emitPaneDrag(true, "history");
        document.body.classList.add("is-agent-dragging");
        ensureDragGhost(label);
      }
      if (!active) return;

      moveDragGhost(moveEvent.clientX, moveEvent.clientY);
      clearPaneDropClasses();
      overPane = null;
      overZone = null;

      const hit = resolveDropTargetAt(moveEvent.clientX, moveEvent.clientY);
      if (!hit?.paneId) return;

      overPane = hit.paneId;
      overZone = hit.zone;
      markPaneDrop(hit.paneEl, hit.zone, {
        asTabMerge: hit.zone === "center",
        hint: t(dropZoneLabelKey(hit.zone)),
      });
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("blur", onCancel);
      document.removeEventListener("visibilitychange", onVisibility);

      if (active) {
        const hit = resolveDropTargetAt(upEvent.clientX, upEvent.clientY);
        if (hit?.paneId) {
          overPane = hit.paneId;
          overZone = hit.zone;
        }
      }

      const dropPane = overPane;
      const dropZone = overZone;
      finishUi();

      if (active) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        if (dropPane && dropZone && resumeAgentRunAtDrop) {
          setView("space");
          void resumeAgentRunAtDrop(run, dropPane, dropZone).then(() => {
            onResume?.();
            window.setTimeout(() => focusPaneTerminal(dropPane), 40);
            window.setTimeout(() => focusPaneTerminal(dropPane), 220);
          });
        }
        return;
      }

      resumeRun(run);
    };

    const onCancel = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
      window.removeEventListener("blur", onCancel);
      document.removeEventListener("visibilitychange", onVisibility);
      finishUi();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") onCancel();
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    window.addEventListener("blur", onCancel);
    document.addEventListener("visibilitychange", onVisibility);
  };

  const renderRun = (run: AgentRun) => {
    const ws = workspaces.find((w) => w.id === run.workspaceId);
    const gone = !ws && !run.vaultId;
    const live = isRunLive(run, workspaces, sessions);
    const label = runQueryLabel(run, sessions);

    return (
      <button
        key={run.id}
        type="button"
        className={`vs-agentHistoryItem${gone ? " is-gone" : ""}${live ? " is-live" : ""}${
          run.vaultId ? " is-vault" : ""
        }${draggingId === run.id ? " is-dragging" : ""}`}
        disabled={gone}
        title={
          gone
            ? t("history.gone")
            : live
              ? t("recentAgents.live")
              : run.vaultId
                ? t("history.vaultResume")
                : t("recentAgents.resume")
        }
        onPointerDown={(event) => {
          if (gone) return;
          beginRunDrag(run, event);
        }}
        onClick={(event) => {
          event.preventDefault();
          if (suppressClickRef.current || gone) return;
        }}
      >
        <AgentBrandIcon id={run.agentId} size={12} className="vs-agentHistoryItemIcon" />
        <span className="vs-agentHistoryItemText">{label}</span>
        <time className="vs-agentHistoryItemWhen" dateTime={new Date(run.at).toISOString()}>
          {formatRelativeTime(run.at, locale)}
        </time>
      </button>
    );
  };

  const groups =
    groupMode === "folder"
      ? folderGroups.map((g) => ({
          key: g.folder,
          title: g.folderName,
          mark: null as string | null,
          runs: g.runs,
        }))
      : agentGroups.map((g) => ({
          key: g.agentId,
          title: g.agentName,
          mark: g.agentId,
          runs: g.runs,
        }));

  return (
    <section
      className={`vs-agentHistory${compact ? " is-compact" : ""}${workspaceId ? " is-scoped" : ""}`}
      aria-label={t("history.title")}
    >
      <div className="vs-agentHistoryToolbar">
        <div className="vs-agentHistoryFilters">
          <button
            type="button"
            className={`vs-agentHistoryFilter${groupMode === "agent" ? " is-on" : ""}`}
            onClick={() => setGroupMode("agent")}
          >
            {t("history.groupAgent")}
          </button>
          <button
            type="button"
            className={`vs-agentHistoryFilter${groupMode === "folder" ? " is-on" : ""}`}
            onClick={() => setGroupMode("folder")}
          >
            {t("history.groupFolder")}
          </button>
          <button
            type="button"
            className={`vs-agentHistoryFilter${scopeCurrent ? " is-on" : ""}`}
            onClick={() => setScopeCurrent((v) => !v)}
            title={scopeWs?.cwd ? folderLabel(scopeWs.cwd) : undefined}
          >
            {t("history.scopeCurrent")}
          </button>
          <button
            type="button"
            className={`vs-agentHistorySearchToggle${searchOpen ? " is-on" : ""}`}
            aria-label={t("history.vaultSearch")}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <SearchMd size={14} aria-hidden />
          </button>
        </div>
        {searchOpen ? (
          <label className="vs-agentHistorySearch">
            <SearchMd size={13} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("history.vaultSearch")}
              spellCheck={false}
              autoFocus
            />
          </label>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <p className="vs-agentHistoryEmpty">{t("history.empty")}</p>
      ) : (
        <div className="vs-agentHistoryGroups">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);

            return (
              <section key={group.key} className="vs-agentHistoryGroup">
                <button
                  type="button"
                  className={`vs-agentHistoryGroupHead${isCollapsed ? " is-collapsed" : ""}`}
                  aria-expanded={!isCollapsed}
                  onClick={() => toggleGroup(group.key)}
                >
                  {group.mark ? (
                    <span className="vs-agentHistoryMark" aria-hidden>
                      <AgentBrandIcon id={group.mark} size={20} />
                    </span>
                  ) : (
                    <span className="vs-agentHistoryMark is-folder" aria-hidden>
                      <Folder size={16} />
                    </span>
                  )}
                  <strong title={group.key}>{group.title}</strong>
                  <ChevronDown size={14} className="vs-agentHistoryChevron" aria-hidden />
                </button>

                {!isCollapsed ? (
                  <div className="vs-agentHistoryItems">
                    {(expandedGroups.has(group.key) ? group.runs : group.runs.slice(0, 5)).map(
                      renderRun,
                    )}
                    {group.runs.length > 5 && !expandedGroups.has(group.key) ? (
                      <button
                        type="button"
                        className="vs-agentHistoryMore"
                        onClick={() =>
                          setExpandedGroups((current) => new Set(current).add(group.key))
                        }
                      >
                        {t("history.showMore")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
