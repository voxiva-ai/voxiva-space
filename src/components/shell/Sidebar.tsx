import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { collectSessionIds } from "@/features/workspace/layout";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import {
  SPACE_COLOR_HEX,
  SPACE_TAB_COLORS,
  type SpaceColor,
  type Workspace,
} from "@/lib/types";
import type { MsgKey } from "@/i18n";
import { IconAssistPanel, IconBell, IconMore, IconPlusStroke, IconSettings, IconX } from "@/components/icons";
import { PromptDialog } from "@/components/PromptDialog";
import { clientError } from "@/lib/errors";
import { savedLayoutPaneCount } from "@/features/workspace/savedLayouts";
import { Pin01, Pin02 } from "@untitledui/icons";
import logoUrl from "@/assets/brand/voxiva-space-mark.png";
import { formatHotkey, loadHotkeys } from "@/features/hotkeys/bindings";

function orderWorkspaces<T extends { pinned?: boolean }>(list: T[]) {
  return [...list].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)));
}

function shortPath(cwd: string) {
  const path = cwd.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return path || cwd;
  if (parts.length === 2) return parts.join("/");
  return parts.slice(-2).join("/");
}

function railColor(ws: Workspace): string | null {
  if (!ws.color || ws.color === "default") return null;
  return SPACE_COLOR_HEX[ws.color as keyof typeof SPACE_COLOR_HEX] ?? null;
}

type MenuState = {
  workspaceId: string;
  x: number;
  y: number;
  mode: "actions" | "color";
} | null;

type SidebarProps = {
  onNewSpace: () => void;
  assistOpen: boolean;
  onToggleAssist: () => void;
};

export function Sidebar({ onNewSpace, assistOpen, onToggleAssist }: SidebarProps) {
  const {
    workspaces,
    activeWorkspace,
    selectWorkspace,
    sessions,
    openWorkspaceInVsCodeInline,
    toggleWorkspacePinned,
    updateWorkspace,
    removeWorkspace,
    setError,
    savedLayouts,
    saveCurrentLayoutAs,
    applySavedLayout,
    removeSavedLayout,
    createWorkspace,
    openNewSpaceFromLayout,
    focusNextAttention,
    focusAttention,
    listAttention,
    clearAllAttention,
    t,
  } = useSpace();
  const { view, setView } = useView();
  const browseFolder = useFolderBrowse();
  const [menu, setMenu] = useState<MenuState>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);
  const notifyRef = useRef<HTMLDivElement>(null);
  const canSaveLayout = view === "space" && Boolean(activeWorkspace);

  const ordered = useMemo(() => orderWorkspaces(workspaces), [workspaces]);
  const pinned = useMemo(() => ordered.filter((w) => w.pinned), [ordered]);
  const unpinned = useMemo(() => ordered.filter((w) => !w.pinned), [ordered]);

  const unreadCount = useMemo(() => {
    let n = 0;
    for (const ws of workspaces) {
      for (const id of collectSessionIds(ws.layout)) {
        if (sessions[id]?.needsAttention) n += 1;
      }
    }
    return n;
  }, [workspaces, sessions]);

  const notifyItems = useMemo(() => listAttention(), [listAttention, sessions, workspaces]);

  useEffect(() => {
    const active = Boolean(menu || plusOpen || notifyOpen || saveOpen);
    window.dispatchEvent(
      new CustomEvent("voxiva-native-overlay", {
        detail: { key: "sidebar-menu", active },
      }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("voxiva-native-overlay", {
          detail: { key: "sidebar-menu", active: false },
        }),
      );
    };
  }, [menu, notifyOpen, plusOpen, saveOpen]);

  useEffect(() => {
    if (!plusOpen && !notifyOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (plusOpen && !plusRef.current?.contains(target)) setPlusOpen(false);
      if (notifyOpen && !notifyRef.current?.contains(target)) setNotifyOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlusOpen(false);
        setNotifyOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [notifyOpen, plusOpen]);

  useEffect(() => {
    if (unreadCount === 0 && notifyOpen) setNotifyOpen(false);
  }, [notifyOpen, unreadCount]);

  type PlusItem = {
    id: string;
    label: string;
    run: () => void;
    disabled?: boolean;
  };

  const spacePlusItems = useMemo<PlusItem[]>(() => {
    return [
      {
        id: "new-space",
        label: t("plus.newSpace"),
        run: () => onNewSpace(),
      },
      {
        id: "duplicate-space",
        label: t("plus.duplicate"),
        disabled: !activeWorkspace,
        run: () => {
          if (!activeWorkspace) return;
          void createWorkspace({
            name: `${activeWorkspace.name} copy`,
            cwd: activeWorkspace.cwd,
            agentIds: [],
          });
        },
      },
    ];
  }, [activeWorkspace, createWorkspace, onNewSpace, t]);

  function runPlusAction(id: string) {
    const item = spacePlusItems.find((row) => row.id === id);
    if (!item || item.disabled) return;
    setPlusOpen(false);
    item.run();
  }

  function closePlusAnd(run: () => void) {
    setPlusOpen(false);
    run();
  }

  const jumpAttentionHint = useMemo(() => {
    const chord = formatHotkey(loadHotkeys().jumpAttention);
    return `${t("shell.notify.title")} · ${chord}`;
  }, [t]);

  function onPlusClick() {
    setNotifyOpen(false);
    setPlusOpen((v) => !v);
  }

  function onNotifyClick() {
    setPlusOpen(false);
    setNotifyOpen((v) => !v);
  }

  function formatAttentionAge(at: number) {
    if (!at) return "";
    const sec = Math.max(0, Math.round((Date.now() - at) / 1000));
    if (sec < 45) return t("shell.notify.justNow");
    if (sec < 3600) return t("shell.notify.minutesAgo").replace("{n}", String(Math.max(1, Math.round(sec / 60))));
    return t("shell.notify.hoursAgo").replace("{n}", String(Math.max(1, Math.round(sec / 3600))));
  }

  function openAttentionItem(item: (typeof notifyItems)[number]) {
    setNotifyOpen(false);
    focusAttention({
      workspaceId: item.workspaceId,
      paneId: item.paneId,
      sessionId: item.sessionId,
    });
  }

  function markAllNotificationsRead() {
    clearAllAttention();
    setNotifyOpen(false);
  }

  async function changeFolder(ws: Workspace) {
    try {
      const picked = await browseFolder(ws.cwd || null);
      if (picked && picked !== ws.cwd) {
        await updateWorkspace(ws.id, { cwd: picked });
      }
    } catch (err) {
      setError(clientError(err));
    }
  }

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

  const openMenu = (event: ReactMouseEvent, ws: Workspace, mode: "actions" | "color" = "actions") => {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect?.();
    const x = mode === "actions" && rect ? rect.right + 4 : event.clientX;
    const y = mode === "actions" && rect ? rect.top : event.clientY;
    setMenu({ workspaceId: ws.id, x, y, mode });
  };

  const closeMenu = () => setMenu(null);

  const renderWsRow = (ws: Workspace) => {
    const rail = railColor(ws);
    return (
      <div
        key={ws.id}
        className={`vs-wsItem${activeWorkspace?.id === ws.id ? " is-active" : ""}${
          attentionByWs.get(ws.id) ? " is-attention" : ""
        }${ws.pinned ? " is-pinned" : ""}${rail ? " has-rail" : ""}`}
        style={rail ? ({ ["--vs-ws-rail"]: rail } as CSSProperties) : undefined}
        onContextMenu={(e) => openMenu(e, ws, "actions")}
      >
        <span className="vs-wsRail" aria-hidden />
        <button
          type="button"
          className="vs-wsItemMain"
          onClick={() => {
            selectWorkspace(ws.id);
            setView("space");
          }}
        >
          <span className="vs-wsItemText">
            <strong>{ws.name}</strong>
            <span className="vs-wsMeta">
              {ws.branch ? (
                <span className="vs-wsBranch" title={ws.branch}>
                  <span className="vs-wsBranchMark" aria-hidden>
                    ⎇
                  </span>
                  {ws.branch}
                </span>
              ) : null}
              {ws.cwd ? (
                <span className="vs-wsCwd" title={ws.cwd}>
                  {shortPath(ws.cwd)}
                </span>
              ) : (
                <span className="vs-wsCwd is-empty">{t("spaces.noFolder")}</span>
              )}
            </span>
          </span>
          {attentionByWs.get(ws.id) ? (
            <span className="vs-attnDot" title={t("term.attention")} aria-label={t("term.attention")} />
          ) : null}
        </button>
        {ws.pinned ? (
          <span className="vs-wsItemPinMark" title={t("spaces.pinned")} aria-hidden>
            <Pin01 size={12} />
          </span>
        ) : null}
        <button
          type="button"
          className="vs-wsItemMore"
          title={t("spaces.menu")}
          aria-label={t("spaces.menu")}
          aria-haspopup="menu"
          onClick={(e) => openMenu(e, ws, "actions")}
        >
          <IconMore size={14} />
        </button>
      </div>
    );
  };

  return (
    <aside className="vs-sidebar">
      <div className="vs-sidebarBrand">
        <img src={logoUrl} alt="" className="vs-sidebarLogo" title="Voxiva Space" />
        <span className="vs-spacer" />
        <div className="vs-sidebarTools">
          <div className="vs-toolGroup" aria-label={t("shell.tools.workspace")}>
            <button
              type="button"
              className={`vs-iconBtn${assistOpen ? " is-active" : ""}`}
              title={t("assist.title")}
              aria-label={t("assist.title")}
              aria-pressed={assistOpen}
              onClick={() => {
                setPlusOpen(false);
                setNotifyOpen(false);
                onToggleAssist();
              }}
            >
              <IconAssistPanel size={14} aria-hidden />
            </button>
            <div className="vs-notifyWrap" ref={notifyRef}>
              <button
                type="button"
                className={`vs-iconBtn vs-notifyBtn${unreadCount ? " is-attention" : ""}${notifyOpen ? " is-active" : ""}`}
                title={jumpAttentionHint}
                aria-label={t("shell.notify.title")}
                aria-haspopup="menu"
                aria-expanded={notifyOpen}
                onClick={onNotifyClick}
              >
                <IconBell size={14} aria-hidden />
                {unreadCount > 0 ? (
                  <span className="vs-notifyBadge" aria-hidden>
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              {notifyOpen ? (
                <div className="vs-chromeFlyout is-menu is-wide is-notifyMenu" role="menu">
                  <div className="vs-notifyHead">
                    <strong>{t("shell.notify.title")}</strong>
                    {notifyItems.length > 0 ? (
                      <button
                        type="button"
                        className="vs-notifyMarkAll"
                        onClick={markAllNotificationsRead}
                      >
                        {t("shell.notify.markAll")}
                      </button>
                    ) : null}
                  </div>
                  {notifyItems.length === 0 ? (
                    <div className="vs-notifyEmpty">{t("shell.notify.empty")}</div>
                  ) : (
                    notifyItems.map((item) => (
                      <button
                        key={item.sessionId}
                        type="button"
                        role="menuitem"
                        className="vs-notifyItem"
                        onClick={() => openAttentionItem(item)}
                      >
                        <span className="vs-notifyItemMain">
                          <strong>{item.title}</strong>
                          <small>
                            {item.workspaceName}
                            {item.reason ? ` · ${item.reason}` : ""}
                          </small>
                        </span>
                        <span className="vs-notifyItemMeta">{formatAttentionAge(item.at)}</span>
                      </button>
                    ))
                  )}
                  {notifyItems.length > 0 ? (
                    <>
                      <div className="vs-chromeMenuSep" role="separator" />
                      <button
                        type="button"
                        role="menuitem"
                        className="is-primary"
                        onClick={() => {
                          setNotifyOpen(false);
                          focusNextAttention();
                        }}
                      >
                        {t("shell.notify.jumpNewest")}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <span className="vs-toolSep" aria-hidden />
          <div className="vs-toolGroup" aria-label={t("shell.tools.app")}>
            <button
              type="button"
              className={`vs-iconBtn${view === "settings" ? " is-active" : ""}`}
              title={t("nav.settings")}
              aria-label={t("nav.settings")}
              aria-pressed={view === "settings"}
              onClick={() => {
                setPlusOpen(false);
                setNotifyOpen(false);
                setView(view === "settings" ? "space" : "settings");
              }}
            >
              <IconSettings size={14} aria-hidden />
            </button>
            <div className="vs-plusWrap" ref={plusRef}>
              <button
                type="button"
                className={`vs-iconBtn vs-addSpaceIcon${plusOpen ? " is-active" : ""}`}
                title={t("spaces.add")}
                aria-label={t("spaces.add")}
                aria-haspopup="menu"
                aria-expanded={plusOpen}
                onClick={onPlusClick}
              >
                <IconPlusStroke size={14} aria-hidden />
              </button>
              {plusOpen ? (
                <div className="vs-chromeFlyout is-menu is-wide is-plusMenu is-layouts" role="menu">
                  {spacePlusItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => runPlusAction(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                  <div className="vs-chromeMenuSep" role="separator" />
                  <div className="vs-chromeMenuLabel">{t("layouts.menu")}</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-primary"
                    disabled={!canSaveLayout}
                    onClick={() => closePlusAnd(() => setSaveOpen(true))}
                  >
                    {t("layouts.saveCurrent")}
                  </button>
                  {savedLayouts.length === 0 ? (
                    <p className="vs-layoutBuildEmpty">{t("layouts.empty")}</p>
                  ) : (
                    <div className="vs-layoutBuildList">
                      {savedLayouts.map((layout) => {
                        const panes = savedLayoutPaneCount(layout);
                        return (
                          <div key={layout.id} className="vs-layoutBuildRow">
                            <button
                              type="button"
                              className="vs-layoutBuildMain"
                              title={t("layouts.newSpace")}
                              onClick={() => closePlusAnd(() => void openNewSpaceFromLayout(layout.id))}
                            >
                              <strong>{layout.name}</strong>
                              <span>{t("layouts.paneCount").replace("{n}", String(panes))}</span>
                            </button>
                            <div className="vs-layoutBuildActions">
                              <button
                                type="button"
                                disabled={!activeWorkspace}
                                title={t("layouts.applyHere")}
                                onClick={() => closePlusAnd(() => void applySavedLayout(layout.id))}
                              >
                                {t("layouts.applyHere")}
                              </button>
                              <button
                                type="button"
                                title={t("layouts.newSpace")}
                                onClick={() => closePlusAnd(() => void openNewSpaceFromLayout(layout.id))}
                              >
                                {t("layouts.newSpace")}
                              </button>
                              <button
                                type="button"
                                className="is-danger"
                                title={t("layouts.remove")}
                                aria-label={t("layouts.remove")}
                                onClick={() => removeSavedLayout(layout.id)}
                              >
                                <IconX size={12} aria-hidden />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="vs-workspaceList">
        {pinned.length > 0 ? (
          <>
            <div className="vs-wsSectionLabel">{t("spaces.pinned")}</div>
            <div className="vs-wsTree">{pinned.map((ws) => renderWsRow(ws))}</div>
          </>
        ) : null}
        {unpinned.length > 0 ? (
          <>
            {pinned.length > 0 ? <div className="vs-wsSectionLabel">{t("spaces.all")}</div> : null}
            <div className="vs-wsTree">{unpinned.map((ws) => renderWsRow(ws))}</div>
          </>
        ) : null}
        {workspaces.length === 0 && (
          <button type="button" className="vs-wsEmpty" onClick={onNewSpace}>
            {t("spaces.add")}
          </button>
        )}
      </div>

      {menu ? (
        <SpaceActionMenu
          menu={menu}
          workspaces={workspaces}
          onClose={closeMenu}
          onMode={(mode) => setMenu((m) => (m ? { ...m, mode } : m))}
          onPickColor={(id, color) => {
            void updateWorkspace(id, { color });
            closeMenu();
          }}
          onVsCode={(ws) => {
            selectWorkspace(ws.id);
            setView("space");
            void openWorkspaceInVsCodeInline(ws.cwd || undefined);
          }}
          onChangeFolder={(ws) => {
            closeMenu();
            void changeFolder(ws);
          }}
          onPin={(ws) => toggleWorkspacePinned(ws.id)}
          onSettings={(ws) => {
            selectWorkspace(ws.id);
            window.dispatchEvent(
              new CustomEvent("voxiva-space-settings", { detail: { workspaceId: ws.id } }),
            );
          }}
          onDelete={(ws) => void removeWorkspace(ws.id)}
          t={t}
        />
      ) : null}

      <PromptDialog
        open={saveOpen}
        title={t("layouts.saveTitle")}
        label={t("layouts.saveLabel")}
        initialValue={activeWorkspace?.name ?? ""}
        confirmLabel={t("layouts.saveConfirm")}
        cancelLabel={t("layouts.saveCancel")}
        onCancel={() => setSaveOpen(false)}
        onConfirm={(value) => {
          setSaveOpen(false);
          saveCurrentLayoutAs(value);
        }}
      />
    </aside>
  );
}

function SpaceActionMenu({
  menu,
  workspaces,
  onClose,
  onMode,
  onPickColor,
  onVsCode,
  onChangeFolder,
  onPin,
  onSettings,
  onDelete,
  t,
}: {
  menu: { workspaceId: string; x: number; y: number; mode: "actions" | "color" };
  workspaces: Workspace[];
  onClose: () => void;
  onMode: (mode: "actions" | "color") => void;
  onPickColor: (workspaceId: string, color: SpaceColor) => void;
  onVsCode: (ws: Workspace) => void;
  onChangeFolder: (ws: Workspace) => void;
  onPin: (ws: Workspace) => void;
  onSettings: (ws: Workspace) => void;
  onDelete: (ws: Workspace) => void;
  t: (key: MsgKey) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const ws = workspaces.find((w) => w.id === menu.workspaceId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!ws) return null;

  const colorLabel = (c: (typeof SPACE_TAB_COLORS)[number]): MsgKey =>
    (`spaces.color.${c}` as MsgKey);

  return (
    <>
      <button type="button" className="vs-wsColorScrim" aria-label={t("palette.close")} onClick={onClose} />
      <div
        ref={ref}
        className="vs-wsActionMenu"
        style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 280) }}
        role="menu"
        aria-label={t("spaces.menu")}
      >
        {menu.mode === "color" ? (
          <>
            <button type="button" className="vs-wsActionBack" onClick={() => onMode("actions")}>
              ← {t("spaces.tabColor")}
            </button>
            <button
              type="button"
              className="vs-wsColorOpt is-default"
              role="menuitem"
              onClick={() => onPickColor(ws.id, "default")}
            >
              <span className="vs-wsColorSwatch is-default" />
              {t("spaces.colorDefault")}
            </button>
            {SPACE_TAB_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`vs-wsColorOpt is-${c}`}
                role="menuitem"
                onClick={() => onPickColor(ws.id, c)}
              >
                <span className={`vs-wsColorSwatch is-${c}`} style={{ background: SPACE_COLOR_HEX[c] }} />
                {t(colorLabel(c))}
              </button>
            ))}
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              className="vs-wsActionItem"
              onClick={() => {
                onClose();
                onVsCode(ws);
              }}
            >
              {t("nav.vscode")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="vs-wsActionItem"
              onClick={() => onChangeFolder(ws)}
            >
              {t("topbar.changeFolder")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="vs-wsActionItem"
              onClick={() => {
                onClose();
                onPin(ws);
              }}
            >
              {ws.pinned ? (
                <>
                  <Pin02 size={14} aria-hidden /> {t("spaces.unpin")}
                </>
              ) : (
                <>
                  <Pin01 size={14} aria-hidden /> {t("spaces.pin")}
                </>
              )}
            </button>
            <button type="button" role="menuitem" className="vs-wsActionItem" onClick={() => onMode("color")}>
              {t("spaces.tabColor")}
            </button>
            <button
              type="button"
              role="menuitem"
              className="vs-wsActionItem"
              onClick={() => {
                onClose();
                onSettings(ws);
              }}
            >
              {t("space.settings.title")}
            </button>
            <div className="vs-wsActionSep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="vs-wsActionItem is-danger"
              onClick={() => {
                onClose();
                onDelete(ws);
              }}
            >
              {t("space.settings.delete")}
            </button>
          </>
        )}
      </div>
    </>
  );
}
