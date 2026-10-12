import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { collectSessionIds, findPaneForSession } from "@/features/workspace/layout";
import { useFolderBrowse } from "@/features/workspace/useFolderBrowse";
import {
  SPACE_COLOR_HEX,
  SPACE_TAB_COLORS,
  type SpaceColor,
  type Workspace,
} from "@/lib/types";
import type { MsgKey } from "@/i18n";
import { IconAssistPanel, IconBell, IconMore, IconPlusStroke, IconSettings, IconSidebar, IconX } from "@/components/icons";
import { PromptDialog } from "@/components/PromptDialog";
import { clientError } from "@/lib/errors";
import { savedLayoutPaneCount } from "@/features/workspace/savedLayouts";
import { Copy, FolderPlus, LayoutGrid, Pin, PinOff, Save } from "lucide-react";
import logoUrl from "@/assets/brand/voxiva-space-mark.png";
import { formatHotkey, loadHotkeys } from "@/features/hotkeys/bindings";
import { BookOpen, Compass, ExternalLink, Flag, Github, Keyboard, MessageSquare, RotateCcw, ScrollText, RefreshCw } from "lucide-react";
import { checkForUpdates, openUpdateUrl, type UpdateCheckResult } from "@/features/updates/api";
import { getCurrentWindow, invoke } from "@/platform/desktop";

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
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({ onNewSpace, assistOpen, onToggleAssist, collapsed, onToggleCollapsed }: SidebarProps) {
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
    locale,
    t,
  } = useSpace();
  const { view, setView } = useView();
  const browseFolder = useFolderBrowse();
  const [menu, setMenu] = useState<MenuState>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpUpdate, setHelpUpdate] = useState<UpdateCheckResult | null>(null);
  const [helpUpdateMessage, setHelpUpdateMessage] = useState("");
  const plusRef = useRef<HTMLDivElement>(null);
  const notifyRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);
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
    const active = Boolean(menu || plusOpen || notifyOpen || saveOpen || helpMenuOpen);
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
  }, [helpMenuOpen, menu, notifyOpen, plusOpen, saveOpen]);

  useEffect(() => {
    if (!plusOpen && !notifyOpen && !helpMenuOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (plusOpen && !plusRef.current?.contains(target)) setPlusOpen(false);
      if (notifyOpen && !notifyRef.current?.contains(target)) setNotifyOpen(false);
      if (helpMenuOpen && !helpRef.current?.contains(target)) setHelpMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlusOpen(false);
        setNotifyOpen(false);
        setHelpMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [helpMenuOpen, notifyOpen, plusOpen]);

  useEffect(() => {
    const onNotificationClick = (event: Event) => {
      const { workspaceId, sessionId } = (event as CustomEvent<{ workspaceId?: string; sessionId?: string }>).detail ?? {};
      if (!workspaceId || !sessionId) return;
      const workspace = workspaces.find((item) => item.id === workspaceId);
      const paneId = workspace && findPaneForSession(workspace.layout, sessionId);
      if (paneId) {
        void getCurrentWindow().unminimize().finally(() => {
          focusAttention({ workspaceId, paneId, sessionId });
        });
      }
    };
    window.addEventListener("voxiva-open-attention", onNotificationClick);
    return () => window.removeEventListener("voxiva-open-attention", onNotificationClick);
  }, [focusAttention, workspaces]);

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
    setHelpMenuOpen(false);
    setPlusOpen((v) => !v);
  }

  function onNotifyClick() {
    setPlusOpen(false);
    setHelpMenuOpen(false);
    setNotifyOpen((v) => !v);
  }

  async function runHelpUpdateCheck() {
    setHelpBusy(true);
    setHelpUpdateMessage("");
    try {
      const result = await checkForUpdates();
      setHelpUpdate(result);
      setHelpUpdateMessage(result.updateAvailable ? t("help.updateAvailable").replace("{version}", result.latestVersion) : t("help.updateCurrent"));
    } catch (error) {
      setHelpUpdate(null);
      setHelpUpdateMessage(t("help.updateFailed"));
      setError(String(error));
    } finally { setHelpBusy(false); }
  }

  function openHelpLink(url: string) {
    setHelpMenuOpen(false);
    void invoke("open_url", { url }).catch((error) => setError(String(error)));
  }

  function openHelpSection(section: "hotkeys" | "about") {
    setHelpMenuOpen(false);
    sessionStorage.setItem("voxiva-open-settings-section", section);
    window.dispatchEvent(new CustomEvent("voxiva-settings-section", { detail: section }));
    setView("settings");
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
    const focused = focusAttention({
      workspaceId: item.workspaceId,
      paneId: item.paneId,
      sessionId: item.sessionId,
    });
    if (!focused) setError(t("shell.notify.sessionEnded"));
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
            <Pin size={12} />
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
    <aside className={`vs-sidebar${collapsed ? " is-rail" : ""}`}>
      <div className="vs-sidebarBrand">
        <img src={logoUrl} alt="" className="vs-sidebarLogo" title="Voxiva Space" />
        <span className="vs-spacer" />
        <div className="vs-sidebarTools">
          <button
            type="button"
            className="vs-iconBtn vs-sidebarCollapse"
            title={t(collapsed ? "shell.sidebarExpand" : "shell.sidebarCollapse")}
            aria-label={t(collapsed ? "shell.sidebarExpand" : "shell.sidebarCollapse")}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
          >
            <IconSidebar size={14} aria-hidden />
          </button>
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
                aria-haspopup="dialog"
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
                <section className="vs-chromeFlyout is-menu is-wide is-notifyMenu" role="dialog" aria-label={t("shell.notify.title")}>
                  <div className="vs-notifyHead">
                    <strong>{t("shell.notify.title")}</strong>
                    {notifyItems.length > 0 ? (
                      <button
                        type="button"
                        className="vs-notifyMarkAll"
                        aria-label={t("shell.notify.markAll")}
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
                </section>
              ) : null}
            </div>
          </div>
          <span className="vs-toolSep" aria-hidden />
          <div className="vs-toolGroup" aria-label={t("shell.tools.app")}>
            <button
              type="button"
              data-view-trigger="settings"
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
            <div className="vs-plusWrap" ref={helpRef}>
              <button type="button" className={`vs-iconBtn vs-helpBtn${helpMenuOpen ? " is-active" : ""}`} title={t("help.title")} aria-label={t("help.title")} aria-haspopup="menu" aria-expanded={helpMenuOpen} onClick={() => { setPlusOpen(false); setNotifyOpen(false); setHelpMenuOpen((open) => !open); }}>
                <span aria-hidden>?</span>
              </button>
              {helpMenuOpen && <div className="vs-chromeFlyout is-menu is-wide vs-helpMenu" role="menu" aria-label={t("help.menuTitle")}>
                <div className="vs-helpMenuHeader"><strong>{t("help.menuTitle")}</strong><button type="button" className="vs-helpMenuClose" aria-label={t("help.close")} title={t("help.close")} onClick={() => setHelpMenuOpen(false)}><IconX size={14} /></button></div>
                <button type="button" role="menuitem" onClick={() => openHelpSection("hotkeys")}><Keyboard size={14} aria-hidden="true" />{t("help.keyboardShortcuts")}</button>
                <button type="button" role="menuitem" onClick={() => openHelpLink("https://github.com/voxiva-ai/voxiva-space/issues/new")}><MessageSquare size={14} aria-hidden="true" />{t("help.sendFeedback")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
                <button type="button" role="menuitem" onClick={() => openHelpLink("https://github.com/voxiva-ai/voxiva-space/milestones")}><Flag size={14} aria-hidden="true" />{t("help.milestones")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
                <button type="button" role="menuitem" onClick={() => { setHelpMenuOpen(false); window.dispatchEvent(new CustomEvent("voxiva-help-open")); }}><Compass size={14} aria-hidden="true" />{t("help.onboarding")}</button>
                <button type="button" role="menuitem" onClick={() => openHelpLink(locale === "ru" ? "https://github.com/voxiva-ai/voxiva-space/blob/main/README.ru.md" : "https://github.com/voxiva-ai/voxiva-space#readme")}><BookOpen size={14} aria-hidden="true" />{t("help.docs")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
                <button type="button" role="menuitem" onClick={() => openHelpLink("https://github.com/voxiva-ai/voxiva-space/releases")}><ScrollText size={14} aria-hidden="true" />{t("help.changelog")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
                <button type="button" role="menuitem" onClick={() => openHelpLink("https://github.com/voxiva-ai/voxiva-space")}><Github size={14} aria-hidden="true" />GitHub<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
                <div className="vs-chromeMenuSep" role="separator" />
                <button type="button" role="menuitem" disabled={helpBusy} onClick={() => void runHelpUpdateCheck()}><RefreshCw size={14} aria-hidden="true" className={helpBusy ? "vs-helpMenuSpin" : ""} />{helpBusy ? t("help.checkingUpdates") : t("help.checkUpdates")}</button>
                {helpUpdateMessage && <div className="vs-helpMenuUpdate" role="status">{helpUpdateMessage}{helpUpdate?.updateAvailable && <button type="button" onClick={() => void openUpdateUrl(helpUpdate.downloadUrl).catch((error) => setError(String(error)))}>{t("help.downloadUpdate")}</button>}</div>}
                <button type="button" role="menuitem" onClick={() => { setHelpMenuOpen(false); void invoke("app_restart").catch((error) => setError(String(error))); }}><RotateCcw size={14} aria-hidden="true" />{t("help.restartApp")}</button>
              </div>}
            </div>
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
                      {item.id === "new-space" ? <FolderPlus size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                      {item.label}
                    </button>
                  ))}
                  <div className="vs-chromeMenuSep" role="separator" />
                  <div className="vs-chromeMenuLabel"><LayoutGrid size={13} aria-hidden />{t("layouts.menu")}</div>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-primary"
                    disabled={!canSaveLayout}
                    onClick={() => closePlusAnd(() => setSaveOpen(true))}
                  >
                    <Save size={14} aria-hidden />
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
                  <PinOff size={14} aria-hidden /> {t("spaces.unpin")}
                </>
              ) : (
                <>
                  <Pin size={14} aria-hidden /> {t("spaces.pin")}
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
