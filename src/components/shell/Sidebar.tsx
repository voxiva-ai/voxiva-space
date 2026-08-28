import { useMemo } from "react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { collectSessionIds } from "@/features/workspace/layout";
import type { ViewId } from "@/lib/types";
import type { ComponentType } from "react";
import {
  Calendar,
  ClockRewind,
  CodeBrowser,
  Globe02,
  LayoutGrid01,
  Plus,
  Settings01,
  TerminalSquare,
  Users01,
} from "@untitledui/icons";
import logoUrl from "@/assets/brand/voxiva-space-mark.svg";

function orderWorkspaces<T extends { pinned?: boolean }>(list: T[]) {
  return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
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
  onExpand: () => void;
  onNewSpace: () => void;
};

export function Sidebar({ collapsed, onExpand, onNewSpace }: SidebarProps) {
  const {
    workspaces,
    activeWorkspace,
    selectWorkspace,
    sessions,
    t,
  } = useSpace();
  const { view, setView } = useView();

  const ordered = useMemo(() => orderWorkspaces(workspaces), [workspaces]);

  const goNav = (id: ViewId) => {
    setView(id);
  };

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
              }`}
              title={ws.name}
              aria-label={ws.name}
              onClick={() => {
                selectWorkspace(ws.id);
                setView("space");
              }}
            >
              <span className={`vs-railWsMark is-${ws.color}`} aria-hidden>
                <TerminalSquare size={22} strokeWidth={2.35} />
              </span>
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
      </div>

      <div className="vs-workspaceList">
        {ordered.map((ws, index) => (
          <div
            key={ws.id}
            className={`vs-wsItem${activeWorkspace?.id === ws.id ? " is-active" : ""}${
              attentionByWs.get(ws.id) ? " is-attention" : ""
            }`}
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
