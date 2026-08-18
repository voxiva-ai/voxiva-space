import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { SplitNode } from "@/lib/types";
import {
  BROWSER_TAB,
  leafTabOrder,
  type SnapLayoutId,
} from "@/features/workspace/layout";
import type { DropZone } from "@/features/workspace/layout";
import {
  dropZoneAt,
  emitPaneDrag,
} from "@/features/workspace/paneDropOverlay";
import { TerminalPane } from "@/features/terminal";
import { enqueueTerminalSpawn, yieldToUi, takeColdStartSlot, coldStartDelayMs } from "@/features/terminal/spawnQueue";
import { NativeBrowser, type BrowserTabMeta } from "@/features/browser/NativeBrowser";
import { browserFaviconUrl, prettyBrowserLabel } from "@/features/browser/tabMeta";
import { PaneActions } from "@/features/workspace/PaneActions";
import { PaneContextMenu, type PaneMenuState } from "@/features/workspace/PaneContextMenu";
import { useSpace } from "@/features/workspace/SpaceContext";
import { IconBrowser, IconGrip, IconTerminal, IconX } from "@/components/icons";

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

function clearPaneDropClasses() {
  document.querySelectorAll(".vs-pane.is-dropTarget, .vs-pane.is-tabDrop").forEach((el) => {
    el.classList.remove("is-dropTarget", "is-tabDrop");
    el.removeAttribute("data-drop-zone");
  });
  document.querySelectorAll(".vs-snapOption.is-dropTarget").forEach((el) => {
    el.classList.remove("is-dropTarget");
  });
}

function markPaneDrop(el: HTMLElement, zone: DropZone, asTabMerge: boolean) {
  el.setAttribute("data-drop-zone", zone);
  if (asTabMerge && zone === "center") {
    el.classList.add("is-tabDrop");
  } else {
    el.classList.add("is-dropTarget");
  }
}

function PaneLeaf({
  paneId,
  kind,
  sessionId,
  sessionIds,
  tabOrder,
  browserUrl,
}: {
  paneId: string;
  kind: "terminal" | "browser";
  sessionId: string | null;
  sessionIds?: string[];
  tabOrder?: string[];
  browserUrl: string | null;
}) {
  const {
    activeWorkspace,
    sessions,
    focusPane,
    spawnInPane,
    takePendingPaneSpawn,
    clearPendingPaneSpawn,
    closePane,
    closeSession,
    closeBrowserTab,
    renameSession,
    activatePaneSession,
    focusBrowserInPane,
    reorderPaneTabs,
    dockPaneTab,
    restartSession,
    applySnapLayout,
    setPaneBrowserUrl,
    dockPane,
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
  const hasBrowser = browserUrl !== null;
  const browserActive = kind === "browser" && hasBrowser;
  const surfaceOrder = useMemo(
    () =>
      leafTabOrder({
        type: "leaf",
        paneId,
        kind,
        sessionId,
        sessionIds: tabIds,
        tabOrder,
        browserUrl,
      }),
    [browserUrl, kind, paneId, sessionId, tabIds, tabOrder],
  );
  const anyAttention = tabIds.some((id) => sessions[id]?.needsAttention);
  const spawning = useRef(false);
  const [spawnReady, setSpawnReady] = useState(focused);
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() =>
    activeId ? new Set([activeId]) : new Set(),
  );
  const tabsStripRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<PaneMenuState>(null);
  const [browserMeta, setBrowserMeta] = useState<BrowserTabMeta | null>(null);
  const [draggingTab, setDraggingTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);
  const suppressTabClickRef = useRef(false);
  const hasChrome = tabIds.length > 0 || hasBrowser;

  // Background panes: stagger PTY start so every terminal still boots without freezing UI.
  useEffect(() => {
    if (spawnReady) return;
    if (focused) {
      takeColdStartSlot(true);
      setSpawnReady(true);
      return;
    }
    let cancelled = false;
    const slot = takeColdStartSlot(false);
    const delay = coldStartDelayMs(slot);
    const timer = window.setTimeout(() => {
      if (!cancelled) setSpawnReady(true);
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [focused, paneId, spawnReady]);

  useEffect(() => {
    if (!activeId) return;
    setMountedTabs((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  useEffect(() => {
    if (focused) setSpawnReady(true);
  }, [focused]);

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
    let overTab: string | null = null;
    let overPane: string | null = null;
    let overZone: DropZone | null = null;
    let overSnap: string | null = null;
    const soleSurface = surfaceOrder.length === 1;

    const onMove = (moveEvent: PointerEvent) => {
      if (
        !active &&
        (Math.abs(moveEvent.clientX - startX) > 4 || Math.abs(moveEvent.clientY - startY) > 4)
      ) {
        active = true;
        setDraggingTab(tabKey);
        emitPaneDrag(true);
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
      overTab = null;
      overPane = null;
      overZone = null;
      overSnap = null;
      setDragOverTab(null);

      const el = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);

      if (soleSurface) {
        const snap = el?.closest("[data-snap-layout]") as HTMLElement | null;
        if (snap) {
          snap.classList.add("is-dropTarget");
          overSnap = snap.getAttribute("data-snap-layout");
          return;
        }
      }

      const targetPane = el?.closest("[data-pane-id]") as HTMLElement | null;
      const targetId = targetPane?.getAttribute("data-pane-id");
      if (!targetPane || !targetId) return;

      let zone = dropZoneAt(
        targetPane.getBoundingClientRect(),
        moveEvent.clientX,
        moveEvent.clientY,
      );

      // Dropping on another pane's tab strip always merges as a tab.
      if (
        targetId !== paneId &&
        el?.closest(".vs-paneTabs, .vs-paneTabBar, [data-tab-key]")
      ) {
        zone = "center";
      }

      // Same pane, center: reorder tabs when hovering another tab.
      if (targetId === paneId && zone === "center") {
        const tabTarget = el?.closest("[data-tab-key]") as HTMLElement | null;
        const key = tabTarget?.getAttribute("data-tab-key");
        overTab = key && key !== tabKey ? key : null;
        setDragOverTab(overTab);
        return;
      }

      // Same pane edge → split this tab out; other pane → merge or dock.
      overPane = targetId;
      overZone = zone;
      markPaneDrop(targetPane, zone, targetId !== paneId);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      clearPaneDropClasses();
      if (active) {
        suppressTabClickRef.current = true;
        emitPaneDrag(false);
        if (overSnap && soleSurface) {
          void applySnapLayout(overSnap as SnapLayoutId, paneId);
        } else if (overPane && overZone) {
          dockPaneTab(paneId, overPane, tabKey, overZone);
        } else if (overTab) {
          reorderPaneTabs(paneId, tabKey, overTab);
        }
      }
      setDraggingTab(null);
      setDragOverTab(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onTabActivate = (action: () => void) => {
    if (suppressTabClickRef.current) {
      suppressTabClickRef.current = false;
      return;
    }
    action();
  };

  // Reset page meta when the tab URL changes (favicon/title refresh on next load).
  useEffect(() => {
    setBrowserMeta(null);
  }, [browserUrl]);

  useEffect(() => {
    if (!renamingId) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  const commitRename = () => {
    if (!renamingId) return;
    renameSession(renamingId, renameDraft);
    setRenamingId(null);
  };

  // Empty pane (no shells, no browser) → spawn Shell. Browser-only → leave it.
  useEffect(() => {
    if (!spawnReady) return;
    if (hasBrowser || tabIds.length > 0) {
      spawning.current = false;
      return;
    }
    if (!activeWorkspace || spawning.current) return;
    spawning.current = true;
    const pending = takePendingPaneSpawn(paneId);
    void enqueueTerminalSpawn(async () => {
      await yieldToUi(0);
      return spawnInPane({
        title: pending?.title ?? "Shell",
        command: pending?.command,
        accent: pending?.accent ?? "green",
        paneId,
        mode: "replace",
      });
    }).then((id) => {
      if (id) clearPendingPaneSpawn(paneId);
      else spawning.current = false;
    });
  }, [
    spawnReady,
    hasBrowser,
    tabIds.length,
    activeWorkspace,
    paneId,
    spawnInPane,
    takePendingPaneSpawn,
    clearPendingPaneSpawn,
  ]);

  const browserTabLabel =
    prettyBrowserLabel(browserUrl || "", browserMeta?.title) || t("nav.browser");

  return (
    <div
      className={`vs-pane${focused ? " is-focused" : ""}${anyAttention ? " is-attention" : ""}`}
      data-pane-id={paneId}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest("input, textarea, a, [data-no-ctx]")) return;
        event.preventDefault();
        focusPane(paneId);
        setMenu({
          paneId,
          x: event.clientX,
          y: event.clientY,
          isBrowser: browserActive,
          sessionId: activeId,
        });
      }}
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-drag]")) {
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
              false,
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
            void applySnapLayout(snapId as SnapLayoutId, fromId);
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
    >
      {hasChrome ? (
        <div className="vs-paneTerminalStack">
          <div className="vs-paneTabBar" data-pane-drag={paneId}>
            <span className="vs-dragHandle" title={t("term.drag")} aria-hidden>
              <IconGrip size={14} />
            </span>
            <div className="vs-paneTabs" role="tablist" data-no-drag ref={tabsStripRef}>
              {surfaceOrder.map((key) => {
                if (key === BROWSER_TAB) {
                  return (
                    <button
                      key={BROWSER_TAB}
                      type="button"
                      role="tab"
                      data-tab-key={BROWSER_TAB}
                      aria-selected={browserActive}
                      title={browserTabLabel}
                      className={`vs-paneTab${browserActive ? " is-active" : ""}${
                        draggingTab === BROWSER_TAB ? " is-dragging" : ""
                      }${dragOverTab === BROWSER_TAB ? " is-drop" : ""}`}
                      onPointerDown={(e) => beginTabDrag(BROWSER_TAB, e)}
                      onClick={() =>
                        onTabActivate(() => {
                          focusBrowserInPane(paneId);
                          focusPane(paneId);
                        })
                      }
                    >
                      <TabGlyph>
                        {(browserUrl || "").trim() ? (
                          <BrowserTabIcon url={browserUrl || ""} pageFavicon={browserMeta?.favicon} />
                        ) : (
                          <IconBrowser size={11} className="vs-paneTabIcon" />
                        )}
                      </TabGlyph>
                      <span className="vs-paneTabLabel">{browserTabLabel}</span>
                      <span
                        className="vs-paneTabClose"
                        role="button"
                        tabIndex={0}
                        title={t("term.closeTab")}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (tabIds.length === 0) void closePane(paneId);
                          else closeBrowserTab(paneId);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            if (tabIds.length === 0) void closePane(paneId);
                            else closeBrowserTab(paneId);
                          }
                        }}
                      >
                        <IconX size={12} />
                      </span>
                    </button>
                  );
                }

                const s = sessions[key];
                if (!s) return null;
                const renaming = renamingId === key;
                const active = !browserActive && key === activeId;
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
                      <IconTerminal size={11} className="vs-paneTabIcon" />
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
                      title={tabIds.length > 1 || hasBrowser ? t("term.closeTab") : t("term.close")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (tabIds.length > 1 || hasBrowser) void closeSession(key);
                        else void closePane(paneId);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          if (tabIds.length > 1 || hasBrowser) void closeSession(key);
                          else void closePane(paneId);
                        }
                      }}
                    >
                      <IconX size={12} />
                    </span>
                  </button>
                );
              })}
            </div>
            <PaneActions
              paneId={paneId}
              sessionId={browserActive ? null : activeId}
              isBrowser={browserActive}
            />
          </div>
          <div className="vs-paneTabBodies">
            {hasBrowser ? (
              <div
                className={`vs-paneTabBody${browserActive ? " is-visible" : ""}`}
                hidden={!browserActive}
              >
                <NativeBrowser
                  compact
                  active={browserActive}
                  dragPaneId={paneId}
                  instanceId={paneId}
                  url={browserUrl || ""}
                  onUrlChange={(url) => setPaneBrowserUrl(paneId, url)}
                  onMetaChange={setBrowserMeta}
                  onClose={() => {
                    if (tabIds.length === 0) void closePane(paneId);
                    else closeBrowserTab(paneId);
                  }}
                />
              </div>
            ) : null}
            {tabIds.map((id) => {
              const s = sessions[id];
              if (!s || !mountedTabs.has(id)) return null;
              const visible = !browserActive && id === activeId;
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
                    onClose={() => void closePane(paneId)}
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
  return (
    <div className="vs-splitRoot">
      <SplitView node={layout} />
    </div>
  );
}
