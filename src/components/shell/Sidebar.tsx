import { useMemo } from "react";
import {
  useSpace,
  useView,
  type AgentRun,
} from "@/features/workspace/SpaceContext";
import { collectSessionIds } from "@/features/workspace/layout";
import type { ViewId } from "@/lib/types";
import type { ComponentType } from "react";
import {
  Pin01,
  ArrowUpRight,
  Calendar,
  ClockRewind,
  CodeBrowser,
  Globe02,
  LayoutGrid01,
  Plus,
  Settings01,
  TerminalSquare,
  Trash01,
  Users01,
  XClose,
} from "@untitledui/icons";
import { IconSidebar } from "@/components/icons";
import logoUrl from "@/assets/brand/voxiva-space-mark.svg";

function orderWorkspaces<T extends { pinned?: boolean }>(list: T[]) {
  return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}

const MAX_RECENT_AGENTS = 30;

/** Agent ids with a dedicated brand badge class (`.vs-agentBadge.is-…`). */
const AGENT_BADGE_IDS = new Set([
  "opencode",
  "claude",
  "codex",
  "gemini",
  "aider",
  "cursor-agent",
  "amp",
  "goose",
  "shell",
]);

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function localeTag(locale: string) {
  return locale.startsWith("ru") ? "ru-RU" : "en-US";
}

function agentInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function agentBadgeClass(agentId: string) {
  return AGENT_BADGE_IDS.has(agentId) ? agentId : "default";
}

const PRIMARY_NAV: Array<{
  id: ViewId;
  labelKey:
    | "nav.space"
    | "nav.editor"
    | "nav.agents"
    | "nav.history"
    | "nav.browser"
    | "nav.board";
  icon: ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: "space", labelKey: "nav.space", icon: LayoutGrid01 },
  { id: "editor", labelKey: "nav.editor", icon: CodeBrowser },
  { id: "agents", labelKey: "nav.agents", icon: Users01 },
  { id: "board", labelKey: "nav.board", icon: Calendar },
  { id: "history", labelKey: "nav.history", icon: ClockRewind },
  { id: "browser", labelKey: "nav.browser", icon: Globe02 },
];

type SidebarProps = {
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onNewSpace: () => void;
};

export function Sidebar({ collapsed, onCollapse, onExpand, onNewSpace }: SidebarProps) {
  const {
    workspaces,
    activeWorkspace,
    selectWorkspace,
    toggleWorkspacePinned,
    sessions,
    t,
    locale,
    agentRuns,
    resumeAgentRun,
    removeAgentRun,
    clearAgentRuns,
  } = useSpace();
  const { view, setView } = useView();

  const ordered = useMemo(() => orderWorkspaces(workspaces), [workspaces]);

  const goNav = (id: ViewId) => {
    setView(id);
  };

  /** Recent agent runs grouped by day (today / yesterday / date), newest first. */
  const runGroups = useMemo(() => {
    const runs = (agentRuns ?? []).slice(0, MAX_RECENT_AGENTS);
    if (runs.length === 0) return [];
    const now = Date.now();
    const today = startOfDay(now);
    const yesterday = startOfDay(now - 86_400_000);
    const loc = localeTag(locale);
    const groups: Array<{ label: string; runs: AgentRun[] }> = [];
    let current: { label: string; runs: AgentRun[] } | null = null;
    for (const run of runs) {
      const day = startOfDay(run.at);
      const label =
        day === today
          ? t("recentAgents.today")
          : day === yesterday
            ? t("recentAgents.yesterday")
            : new Date(run.at).toLocaleDateString(loc, { day: "numeric", month: "long" });
      if (!current || current.label !== label) {
        current = { label, runs: [] };
        groups.push(current);
      }
      current.runs.push(run);
    }
    return groups;
  }, [agentRuns, t, locale]);

  const resumeRun = (run: AgentRun) => {
    if (!resumeAgentRun) return;
    void resumeAgentRun(run).then(() => setView("space"));
  };

  const formatRunTime = (at: number) =>
    new Date(at).toLocaleTimeString(localeTag(locale), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const attentionByWs = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const ws of workspaces) {
      const ids = collectSessionIds(ws.layout);
      map.set(
        ws.id,
        ids.some((id) => sessions[id]?.needsAttention),
      );
    }
    return map;
  }, [workspaces, sessions]);

  if (collapsed) {
    return (
      <aside className="vs-sidebar is-rail" aria-label="Navigation">
        <button
          type="button"
          className="vs-railBrand"
          title={t("shell.expand")}
          aria-label={t("shell.expand")}
          onClick={onExpand}
        >
          <img src={logoUrl} alt="" className="vs-railLogo" />
        </button>

        <div className="vs-railWorkspaces" role="group" aria-label={t("spaces.title")}>
          {ordered.slice(0, 8).map((ws) => (
            <button
              key={ws.id}
              type="button"
              className={`vs-railWs${activeWorkspace?.id === ws.id ? " is-active" : ""}${
                attentionByWs.get(ws.id) ? " is-attention" : ""
              }${ws.pinned ? " is-pinned" : ""}`}
              title={ws.pinned ? `${ws.name} · ${t("spaces.pinned")}` : ws.name}
              aria-label={ws.name}
              onClick={() => {
                selectWorkspace(ws.id);
                setView("space");
              }}
            >
              <span className={`vs-railWsMark is-${ws.color}`} aria-hidden>
                <TerminalSquare size={22} strokeWidth={2.35} />
              </span>
              {ws.pinned ? (
                <span className="vs-railWsPin" aria-hidden>
                  <Pin01 size={10} />
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            className="vs-railAdd"
            title={t("spaces.add")}
            aria-label={t("spaces.add")}
            onClick={onNewSpace}
          >
            <Plus size={15} aria-hidden />
          </button>
        </div>

        <div className="vs-railSpacer" aria-hidden />

        <nav className="vs-railNav" aria-label="Main">
          {PRIMARY_NAV.map((item) => {
            const NavIcon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`vs-railBtn${view === item.id ? " is-active" : ""}`}
                title={t(item.labelKey)}
                aria-label={t(item.labelKey)}
                onClick={() => goNav(item.id)}
              >
                <NavIcon size={17} aria-hidden />
              </button>
            );
          })}
        </nav>

        <div className="vs-railFoot">
          <button
            type="button"
            className={`vs-railBtn${view === "settings" ? " is-active" : ""}`}
            title={t("nav.settings")}
            aria-label={t("nav.settings")}
            onClick={() => setView("settings")}
          >
            <Settings01 size={17} aria-hidden />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="vs-sidebar">
      <div className="vs-sidebarBrand">
        <img src={logoUrl} alt="" className="vs-sidebarLogo" />
        <span className="vs-brandName">Voxiva Space</span>
        <span className="vs-spacer" />
        <button
          type="button"
          className="vs-iconBtn vs-addSpaceIcon"
          title={t("spaces.add")}
          aria-label={t("spaces.add")}
          onClick={onNewSpace}
        >
          <Plus size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="vs-iconBtn is-collapse"
          title={t("shell.collapse")}
          aria-label={t("shell.collapse")}
          onClick={onCollapse}
        >
          <IconSidebar size={16} />
        </button>
      </div>

      <div className="vs-workspaceList">
        {ordered.map((ws, index) => (
          <div
            key={ws.id}
            className={`vs-wsItem${activeWorkspace?.id === ws.id ? " is-active" : ""}${
              attentionByWs.get(ws.id) ? " is-attention" : ""
            }${ws.pinned ? " is-pinned" : ""}`}
          >
            <button
              type="button"
              className="vs-wsItemMain"
              onClick={() => {
                selectWorkspace(ws.id);
                setView("space");
              }}
            >
              <span className={`vs-wsAvatar is-${ws.color}`} aria-hidden>
                <TerminalSquare size={18} strokeWidth={2.35} />
              </span>
              <span>
                <strong>
                  {index + 1}. {ws.name}
                </strong>
                {ws.branch ? <small>{ws.branch}</small> : null}
              </span>
              {attentionByWs.get(ws.id) ? (
                <span className="vs-attnDot" title={t("term.attention")} aria-label={t("term.attention")} />
              ) : null}
            </button>
            <button
              type="button"
              className={`vs-wsItemPin${ws.pinned ? " is-on" : ""}`}
              title={ws.pinned ? t("spaces.unpin") : t("spaces.pin")}
              aria-label={ws.pinned ? t("spaces.unpin") : t("spaces.pin")}
              aria-pressed={Boolean(ws.pinned)}
              onClick={(e) => {
                e.stopPropagation();
                toggleWorkspacePinned(ws.id);
              }}
            >
              <Pin01 size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="vs-wsItemGear"
              title={t("space.settings.title")}
              aria-label={t("space.settings.title")}
              onClick={(e) => {
                e.stopPropagation();
                selectWorkspace(ws.id);
                window.dispatchEvent(
                  new CustomEvent("voxiva-space-settings", { detail: { workspaceId: ws.id } }),
                );
              }}
            >
              <Settings01 size={14} aria-hidden />
            </button>
          </div>
        ))}
        {workspaces.length === 0 && (
          <button type="button" className="vs-wsEmpty" onClick={onNewSpace}>
            {t("spaces.add")}
          </button>
        )}
      </div>

      <section className="vs-recentAgents" aria-label={t("recentAgents.title")}>
        <div className="vs-recentAgentsHead">
          <span className="vs-recentAgentsTitle">{t("recentAgents.title")}</span>
          <div className="vs-recentAgentsActions">
            {runGroups.length > 0 ? (
              <button
                type="button"
                className="vs-iconBtn vs-recentAgentsClear"
                title={t("recentAgents.clear")}
                aria-label={t("recentAgents.clear")}
                onClick={() => clearAgentRuns?.()}
              >
                <Trash01 size={13} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="vs-iconBtn vs-recentAgentsOpen"
              title={t("recentAgents.openAgents")}
              aria-label={t("recentAgents.openAgents")}
              onClick={() => setView("agents")}
            >
              <ArrowUpRight size={14} aria-hidden />
            </button>
          </div>
        </div>

        {runGroups.length === 0 ? (
          <p className="vs-recentAgentsEmpty">{t("recentAgents.empty")}</p>
        ) : (
          <div className="vs-recentAgentsList">
            {runGroups.map((group, gi) => (
              <div key={`${group.label}-${gi}`} className="vs-recentAgentsGroup">
                <div className="vs-recentAgentsGroupLabel">{group.label}</div>
                {group.runs.map((run) => {
                  const gone = !workspaces.some((ws) => ws.id === run.workspaceId);
                  return (
                    <div
                      key={run.id}
                      className={`vs-runItem${gone ? " is-gone" : ""}`}
                      title={gone ? t("recentAgents.gone") : undefined}
                    >
                      <button
                        type="button"
                        className="vs-runItemMain"
                        title={gone ? undefined : t("recentAgents.resume")}
                        disabled={gone}
                        onClick={() => resumeRun(run)}
                      >
                        <span
                          className={`vs-agentBadge is-${agentBadgeClass(run.agentId)}`}
                          aria-hidden
                        >
                          {agentInitials(run.agentName)}
                        </span>
                        <span className="vs-runItemBody">
                          <strong>{run.agentName}</strong>
                          <small>
                            {run.workspaceName} · {formatRunTime(run.at)}
                          </small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="vs-runItemRemove"
                        title={t("recentAgents.removeOne")}
                        aria-label={t("recentAgents.removeOne")}
                        onClick={() => removeAgentRun?.(run.id)}
                      >
                        <XClose size={12} aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      <nav className="vs-nav" aria-label="Main">
        {PRIMARY_NAV.map((item) => {
          const NavIcon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={`vs-navItem${view === item.id ? " is-active" : ""}`}
              onClick={() => goNav(item.id)}
            >
              <NavIcon size={17} className="vs-navIcon" aria-hidden />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className="vs-sidebarFoot">
        <button
          type="button"
          className={`vs-navItem${view === "settings" ? " is-active" : ""}`}
          onClick={() => setView("settings")}
        >
          <Settings01 size={17} className="vs-navIcon" aria-hidden />
          <span>{t("nav.settings")}</span>
        </button>
      </div>
    </aside>
  );
}
