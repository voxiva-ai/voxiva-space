import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconAssistPanel, IconX } from "@/components/icons";
import { AgentHistoryPanel } from "@/components/shell/AgentHistoryPanel";
import { NativeBrowser } from "@/features/browser/NativeBrowser";
import { useSpace } from "@/features/workspace/SpaceContext";

export type AssistTab = "browser" | "agents";

const WIDTH_KEY = "voxiva-space-assist-w";
const MIN_W = 320;
const MAX_W = 720;
const DEFAULT_W = 440;

type AssistPanelProps = {
  open: boolean;
  tab: AssistTab;
  onTabChange: (tab: AssistTab) => void;
  onClose: () => void;
  pendingUrl?: string | null;
  onPendingUrlConsumed?: () => void;
};

export function AssistPanel({
  open,
  tab,
  onTabChange,
  onClose,
  pendingUrl,
  onPendingUrlConsumed,
}: AssistPanelProps) {
  const { activeWorkspace, t } = useSpace();
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(n) && n >= MIN_W && n <= MAX_W) return n;
    } catch {
      // ignore
    }
    return DEFAULT_W;
  });
  const [assistUrl, setAssistUrl] = useState("");
  const [mounted, setMounted] = useState(open);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  useEffect(() => {
    if (!open || !pendingUrl) return;
    setAssistUrl(pendingUrl);
    onTabChange("browser");
    onPendingUrlConsumed?.();
  }, [open, pendingUrl, onPendingUrlConsumed, onTabChange]);

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startW: width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onResizeMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const next = Math.min(
      MAX_W,
      Math.max(MIN_W, dragRef.current.startW + (dragRef.current.startX - event.clientX)),
    );
    setWidth(next);
  }

  function onResizeEnd() {
    dragRef.current = null;
  }

  if (!mounted) {
    return null;
  }

  return (
    <aside
      className={`vs-assist${open ? " is-open" : ""}`}
      style={{ width }}
      aria-label={t("assist.title")}
      hidden={!open}
    >
      <div
        className="vs-assistResize"
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        role="separator"
        aria-orientation="vertical"
        aria-label={t("assist.resize")}
      />
      <header className="vs-assistHead">
        <div className="vs-assistTabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`vs-assistTab${tab === "browser" ? " is-active" : ""}`}
            aria-selected={tab === "browser"}
            onClick={() => onTabChange("browser")}
          >
            {t("assist.browser")}
          </button>
          <button
            type="button"
            role="tab"
            className={`vs-assistTab${tab === "agents" ? " is-active" : ""}`}
            aria-selected={tab === "agents"}
            onClick={() => onTabChange("agents")}
          >
            {t("assist.agents")}
          </button>
        </div>
        <button
          type="button"
          className="vs-iconBtn"
          title={t("assist.close")}
          aria-label={t("assist.close")}
          onClick={onClose}
        >
          <IconX size={14} />
        </button>
      </header>

      {!activeWorkspace ? (
        <div className="vs-assistEmpty">
          <IconAssistPanel size={22} aria-hidden />
          <p>{t("assist.needWorkspace")}</p>
        </div>
      ) : (
        <div className="vs-assistBody">
          <div className="vs-assistBrowser" hidden={tab !== "browser"}>
            <NativeBrowser
              active={open && tab === "browser"}
              instanceId="assist"
              url={assistUrl}
              onUrlChange={setAssistUrl}
            />
          </div>

          {tab === "agents" && (
            <div className="vs-assistAgents">
              <AgentHistoryPanel compact />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
