import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Plus } from "@untitledui/icons";
import { IconBrowser, IconCodeBrowser, IconRefresh, IconTerminal, IconX } from "@/components/icons";
import { agentBots } from "@/features/agents/bots";
import { useSpace } from "@/features/workspace/SpaceContext";
import { openInCode } from "@/features/terminal/api";
import { clientError } from "@/lib/errors";
import { BROWSER_TAB, findLeaf, isBrowserTabKey, leafSurfaceCount } from "@/features/workspace/layout";

export type PaneMenuState = {
  paneId: string;
  x: number;
  y: number;
  isBrowser: boolean;
  sessionId: string | null;
  tabId: string | null;
} | null;

type PaneContextMenuProps = {
  menu: PaneMenuState;
  onClose: () => void;
};

function IconSplitSide({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable={false}>
      <rect x="2" y="2.5" width="5.25" height="11" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="8.75" y="2.5" width="5.25" height="11" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconSplitStack({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable={false}>
      <rect x="2.5" y="2" width="11" height="5.25" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="8.75" width="11" height="5.25" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconFork({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable={false}>
      <path
        d="M5 3.5v3.2c0 1 .8 1.8 1.8 1.8h4.4M11 12.5V8.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5" cy="2.6" r="1.35" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11" cy="13.4" r="1.35" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="13.4" r="1.35" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 4v8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden focusable={false}>
      <path
        d="M6 3.5 11 8l-5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Item({
  icon,
  label,
  danger,
  onSelect,
}: {
  icon?: ReactNode;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={danger ? "is-danger" : undefined}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect();
      }}
    >
      <span className="vs-paneMenuIcon" aria-hidden>
        {icon}
      </span>
      <span className="vs-paneMenuLabel">{label}</span>
    </button>
  );
}

function Submenu({
  icon,
  label,
  open,
  onOpen,
  onClose,
  children,
}: {
  icon: ReactNode;
  label: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<"right" | "left">("right");
  const closeTimer = useRef(0);

  useLayoutEffect(() => {
    if (!open || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    const flyoutW = 220;
    setSide(rect.right + flyoutW > window.innerWidth - 8 ? "left" : "right");
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = 0;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(onClose, 160);
  };

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      ref={rowRef}
      className={`vs-paneMenuSub${open ? " is-open" : ""}`}
      onPointerEnter={() => {
        cancelClose();
        onOpen();
      }}
      onPointerLeave={scheduleClose}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className="vs-paneMenuSubTrigger"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) onClose();
          else onOpen();
        }}
      >
        <span className="vs-paneMenuIcon" aria-hidden>
          {icon}
        </span>
        <span className="vs-paneMenuLabel">{label}</span>
        <span className="vs-paneMenuChevron" aria-hidden>
          <IconChevron />
        </span>
      </button>
      {open ? (
        <div
          className={`vs-paneMenuFlyout is-${side}`}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerEnter={cancelClose}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function PaneContextMenu({ menu, onClose }: PaneContextMenuProps) {
  const {
    splitShellAt,
    openBrowserInFocused,
    focusBrowserInPane,
    focusTerminalInPane,
    spawnInPane,
    closePane,
    closePaneSurface,
    dockPaneTab,
    restartSession,
    forkFocused,
    openWorkspaceInVsCodeInline,
    setError,
    t,
    activeWorkspace,
    sessions,
  } = useSpace();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [openSub, setOpenSub] = useState<"terminal" | "browser" | "fork" | null>(null);
  const menuRef = menu;

  const forkSession =
    menuRef?.sessionId && !menuRef.isBrowser ? sessions[menuRef.sessionId] : null;
  const forkAgentId = forkSession?.agentId && forkSession.agentId !== "shell" ? forkSession.agentId : null;
  const forkBot = forkAgentId ? agentBots.find((b) => b.id === forkAgentId) : null;
  const forkMenuLabel = forkBot
    ? t("fork.menuAgent").replace("{name}", forkBot.name)
    : t("fork.menu");

  useLayoutEffect(() => {
    if (!menu) return;
    setOpenSub(null);
    const el = ref.current;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = menu.x;
    let y = menu.y;
    if (x + w > window.innerWidth - pad) x = Math.max(pad, menu.x - w);
    if (y + h > window.innerHeight - pad) y = Math.max(pad, menu.y - h);
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    if (x + w > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - w - pad);
    if (y + h > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - h - pad);
    setPos({ x, y });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onResize = () => onClose();
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onResize);
    };
  }, [menu, onClose]);

  if (!menuRef) return null;

  const leaf = activeWorkspace ? findLeaf(activeWorkspace.layout, menuRef.paneId) : null;
  const surfaces = leaf ? leafSurfaceCount(leaf) : 0;
  const surfaceId =
    menuRef.tabId ??
    (menuRef.isBrowser ? BROWSER_TAB : menuRef.sessionId);
  const canDetach = Boolean(surfaceId) && surfaces > 1;

  function run(action: () => void | Promise<void>) {
    onClose();
    window.queueMicrotask(() => {
      void action();
    });
  }

  return createPortal(
    <div
      ref={ref}
      className="vs-paneMenu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Submenu
        icon={<IconTerminal size={14} />}
        label={t("space.menu.terminal")}
        open={openSub === "terminal"}
        onOpen={() => setOpenSub("terminal")}
        onClose={() => setOpenSub((s) => (s === "terminal" ? null : s))}
      >
        <Item
          icon={<IconTerminal size={14} />}
          label={t("space.menu.terminalIn")}
          onSelect={() => run(() => void focusTerminalInPane(menuRef.paneId))}
        />
          <Item
          icon={<Plus size={14} />}
          label={t("space.menu.newTab")}
          onSelect={() =>
            run(() => {
              void spawnInPane({
                title: "Shell",
                paneId: menuRef.paneId,
                mode: "tab",
                accent: "green",
                agentId: "shell",
              });
            })
          }
        />
        <Item
          icon={<IconSplitSide />}
          label={t("space.menu.shellRight")}
          onSelect={() => run(() => void splitShellAt(menuRef.paneId, "right"))}
        />
        <Item
          icon={<IconSplitSide />}
          label={t("space.menu.shellLeft")}
          onSelect={() => run(() => void splitShellAt(menuRef.paneId, "left"))}
        />
        <Item
          icon={<IconSplitStack />}
          label={t("space.menu.shellBelow")}
          onSelect={() => run(() => void splitShellAt(menuRef.paneId, "bottom"))}
        />
        <Item
          icon={<IconSplitStack />}
          label={t("space.menu.shellAbove")}
          onSelect={() => run(() => void splitShellAt(menuRef.paneId, "top"))}
        />
        {menuRef.sessionId ? (
          <Item
            icon={<IconRefresh size={14} />}
            label={t("term.restart")}
            onSelect={() => run(() => void restartSession(menuRef.sessionId!))}
          />
        ) : null}
      </Submenu>

      <Submenu
        icon={<IconBrowser size={14} />}
        label={t("space.menu.browser")}
        open={openSub === "browser"}
        onOpen={() => setOpenSub("browser")}
        onClose={() => setOpenSub((s) => (s === "browser" ? null : s))}
      >
        <Item
          icon={<IconBrowser size={14} />}
          label={t("space.menu.addBrowserTab")}
          onSelect={() => run(() => void openBrowserInFocused(menuRef.paneId, "tab"))}
        />
        {menuRef.isBrowser ? (
          <Item
            icon={<IconBrowser size={14} />}
            label={t("space.menu.browserFocus")}
            onSelect={() =>
              run(() =>
                focusBrowserInPane(
                  menuRef.paneId,
                  menuRef.tabId && isBrowserTabKey(menuRef.tabId) ? menuRef.tabId : undefined,
                ),
              )
            }
          />
        ) : null}
        <Item
          icon={<IconSplitSide />}
          label={t("space.menu.browserRight")}
          onSelect={() => run(() => void openBrowserInFocused(menuRef.paneId, "beside"))}
        />
        <Item
          icon={<IconSplitSide />}
          label={t("space.menu.browserLeft")}
          onSelect={() => run(() => void openBrowserInFocused(menuRef.paneId, "left"))}
        />
        <Item
          icon={<IconSplitStack />}
          label={t("space.menu.browserBelow")}
          onSelect={() => run(() => void openBrowserInFocused(menuRef.paneId, "below"))}
        />
        <Item
          icon={<IconSplitStack />}
          label={t("space.menu.browserAbove")}
          onSelect={() => run(() => void openBrowserInFocused(menuRef.paneId, "above"))}
        />
        {menuRef.isBrowser ? (
          <Item
            icon={<IconRefresh size={14} />}
            label={t("browser.reload")}
            onSelect={() =>
              run(() => {
                window.dispatchEvent(
                  new CustomEvent("voxiva-browser-reload", {
                    detail: { paneId: menuRef.paneId },
                  }),
                );
              })
            }
          />
        ) : null}
      </Submenu>

      {menuRef.sessionId || menuRef.isBrowser ? (
        <>
          <div className="vs-paneMenuSep" />
          <Submenu
            icon={<IconFork />}
            label={forkMenuLabel}
            open={openSub === "fork"}
            onOpen={() => setOpenSub("fork")}
            onClose={() => setOpenSub((s) => (s === "fork" ? null : s))}
          >
            <div className="vs-paneMenuHint">{t("fork.hint")}</div>
            <Item
              icon={<Plus size={14} />}
              label={t("fork.tab")}
              onSelect={() =>
                run(() => forkFocused("tab", menuRef.paneId, menuRef.tabId ?? undefined))
              }
            />
            <Item
              icon={<IconSplitSide />}
              label={t("fork.right")}
              onSelect={() =>
                run(() => forkFocused("right", menuRef.paneId, menuRef.tabId ?? undefined))
              }
            />
            <Item
              icon={<IconSplitStack />}
              label={t("fork.workspace")}
              onSelect={() =>
                run(() => forkFocused("workspace", menuRef.paneId, menuRef.tabId ?? undefined))
              }
            />
          </Submenu>
        </>
      ) : null}

      <div className="vs-paneMenuSep" />

      <Item
        icon={<IconCodeBrowser size={14} />}
        label={t("space.menu.vscodeInline")}
        onSelect={() =>
          run(() => {
            void openWorkspaceInVsCodeInline(activeWorkspace?.cwd);
          })
        }
      />
      <Item
        icon={<IconCodeBrowser size={14} />}
        label={t("space.menu.vscodeDesktop")}
        onSelect={() =>
          run(() => {
            const cwd = activeWorkspace?.cwd?.trim();
            if (!cwd) {
              setError(t("vscode.needFolder"));
              return;
            }
            void openInCode(cwd).catch((err) => {
              const raw = err instanceof Error ? err.message : String(err);
              setError(
                raw.includes("VS Code") || raw.includes("code") ? raw : clientError(err),
              );
            });
          })
        }
      />

      <div className="vs-paneMenuSep" />

      {menuRef.isBrowser || menuRef.sessionId ? (
        <Item
          icon={<IconRefresh size={14} />}
          label={menuRef.isBrowser ? t("browser.reload") : t("term.restart")}
          onSelect={() =>
            run(() => {
              if (menuRef.isBrowser) {
                window.dispatchEvent(
                  new CustomEvent("voxiva-browser-reload", {
                    detail: { paneId: menuRef.paneId },
                  }),
                );
                return;
              }
              if (menuRef.sessionId) void restartSession(menuRef.sessionId);
            })
          }
        />
      ) : null}

      {canDetach && surfaceId ? (
        <Item
          icon={<IconSplitSide />}
          label={t("space.menu.detachTab")}
          onSelect={() =>
            run(() => dockPaneTab(menuRef.paneId, menuRef.paneId, surfaceId, "right"))
          }
        />
      ) : null}

      {surfaceId && surfaces > 1 ? (
        <Item
          icon={<IconX size={14} />}
          label={t("term.closeTab")}
          danger
          onSelect={() => run(() => void closePaneSurface(menuRef.paneId, surfaceId))}
        />
      ) : null}

      <Item
        icon={<IconX size={14} />}
        label={t("space.menu.close")}
        danger
        onSelect={() => run(() => void closePane(menuRef.paneId))}
      />
    </div>,
    document.body,
  );
}
