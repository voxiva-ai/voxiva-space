import { Plus } from "@untitledui/icons";
import { IconBrowser, IconRefresh, IconX } from "@/components/icons";
import { useSpace } from "@/features/workspace/SpaceContext";

/** Pane chrome: reload · shell tab · browser tab · close. Splits live in the context menu. */
export function PaneActions({
  paneId,
  sessionId,
  isBrowser = false,
}: {
  paneId: string;
  sessionId: string | null;
  isBrowser?: boolean;
}) {
  const { spawnInPane, openBrowserInFocused, closePane, restartSession, t } = useSpace();
  const canRefresh = isBrowser || Boolean(sessionId);

  return (
    <div className="vs-paneActions" data-no-drag data-no-ctx>
      {canRefresh ? (
        <button
          type="button"
          className="vs-termIconBtn"
          title={isBrowser ? t("browser.reload") : t("term.restart")}
          aria-label={isBrowser ? t("browser.reload") : t("term.restart")}
          onClick={() => {
            if (isBrowser) {
              window.dispatchEvent(
                new CustomEvent("voxiva-browser-reload", { detail: { paneId } }),
              );
              return;
            }
            if (sessionId) void restartSession(sessionId);
          }}
        >
          <IconRefresh size={14} />
        </button>
      ) : null}
      <button
        type="button"
        className="vs-termIconBtn"
        title={t("space.menu.newTab")}
        aria-label={t("space.menu.newTab")}
        onClick={() =>
          void spawnInPane({
            title: "Shell",
            paneId,
            mode: "tab",
            accent: "green",
          })
        }
      >
        <Plus size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="vs-termIconBtn"
        title={t("space.menu.addBrowserTab")}
        aria-label={t("space.menu.addBrowserTab")}
        onClick={() => void openBrowserInFocused(paneId, "tab")}
      >
        <IconBrowser size={14} />
      </button>
      <button
        type="button"
        className="vs-termIconBtn is-danger"
        title={t("term.close")}
        aria-label={t("term.close")}
        onClick={() => void closePane(paneId)}
      >
        <IconX size={14} />
      </button>
    </div>
  );
}
