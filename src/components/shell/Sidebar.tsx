import { useSpace } from "@/features/workspace/SpaceContext";
import type { ViewId } from "@/lib/types";
import type { ComponentType } from "react";
import {
  Calendar,
  ClockRewind,
  CodeBrowser,
  Globe02,
  LayoutGrid01,
  LayoutLeft,
  Plus,
  Settings01,
  TerminalSquare,
  Users01,
} from "@untitledui/icons";
import logoUrl from "@/assets/brand/voxiva-space-mark.svg";

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
  const { view, setView, workspaces, activeWorkspace, selectWorkspace, t } = useSpace();

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
          {workspaces.slice(0, 8).map((ws) => (
            <button
              key={ws.id}
              type="button"
              className={`vs-railWs${activeWorkspace?.id === ws.id ? " is-active" : ""}`}
              title={ws.name}
              aria-label={ws.name}
              onClick={() => {
                selectWorkspace(ws.id);
                setView("space");
              }}
            >
              <span className={`vs-railWsMark is-${ws.color}`} aria-hidden>
                <TerminalSquare size={18} />
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
                onClick={() => setView(item.id)}
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
        <div>
          <strong>
            Voxiva <span>Space</span>
          </strong>
          <small>{t("brand.sub")}</small>
        </div>
        <button
          type="button"
          className="vs-iconBtn is-collapse"
          title={t("shell.collapse")}
          aria-label={t("shell.collapse")}
          onClick={onCollapse}
        >
          <LayoutLeft size={16} aria-hidden />
        </button>
      </div>

      <div className="vs-workspaceList">
        <div className="vs-workspaceListHeader">
          <span className="vs-spacesLabel">{t("spaces.title")}</span>
          <button
            type="button"
            className="vs-addSpaceBtn"
            title={t("spaces.add")}
            aria-label={t("spaces.add")}
            onClick={onNewSpace}
          >
            <Plus size={14} aria-hidden />
            <span>{t("spaces.add")}</span>
          </button>
        </div>
        {workspaces.map((ws, index) => (
          <button
            key={ws.id}
            type="button"
            className={`vs-wsItem${activeWorkspace?.id === ws.id ? " is-active" : ""}`}
            onClick={() => {
              selectWorkspace(ws.id);
              setView("space");
            }}
          >
            <span className={`vs-wsAvatar is-${ws.color}`} aria-hidden>
              <TerminalSquare size={17} />
            </span>
            <span>
              <strong>
                {index + 1}. {ws.name}
              </strong>
              <small>{ws.branch ? `${ws.branch} · ${ws.cwd}` : ws.cwd}</small>
            </span>
          </button>
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
              onClick={() => setView(item.id)}
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
