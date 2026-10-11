import { useEffect, useState } from "react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import type { ViewId } from "@/lib/types";
import type { MsgKey } from "@/i18n";

const pages: Array<{ id: ViewId; title: MsgKey; description: MsgKey }> = [
  { id: "space", title: "nav.space", description: "help.space" },
  { id: "projects", title: "nav.projects", description: "help.projects" },
  { id: "agents", title: "nav.agents", description: "help.agents" },
  { id: "board", title: "nav.board", description: "help.board" },
  { id: "history", title: "nav.history", description: "help.history" },
  { id: "browser", title: "nav.browser", description: "help.browser" },
  { id: "settings", title: "nav.settings", description: "help.settings" },
];

export function HelpGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useSpace();
  const { view, setView } = useView();
  const [selected, setSelected] = useState<ViewId>(view);

  useEffect(() => {
    if (open) setSelected(view);
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;
  const active = pages.find((page) => page.id === selected) ?? pages[0];

  return (
    <div
      className="vs-helpBackdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="vs-helpDialog" role="dialog" aria-modal="true" aria-labelledby="vs-help-title">
        <header className="vs-helpHeader">
          <div>
            <p>{t("help.eyebrow")}</p>
            <h2 id="vs-help-title">{t("help.title")}</h2>
            <span>{t("help.lead")}</span>
          </div>
          <button type="button" className="vs-iconBtn" aria-label={t("help.close")} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="vs-helpLayout">
          <nav className="vs-helpNav" aria-label={t("help.pages")}>
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                className={selected === page.id ? "is-active" : ""}
                aria-current={view === page.id ? "page" : undefined}
                onClick={() => setSelected(page.id)}
              >
                <span>{t(page.title)}</span>
                {view === page.id ? <i aria-hidden /> : null}
              </button>
            ))}
          </nav>
          <article className="vs-helpDetail">
            <p className="vs-helpEyebrow">{t("help.overview")}</p>
            <h3>{t(active.title)}</h3>
            <p>{t(active.description)}</p>
            <div className="vs-helpTip">
              <strong>{t("help.quickTip")}</strong>
              <span>{t("help.quickTipBody")}</span>
            </div>
            <button
              type="button"
              className="vs-btn vs-btnPrimary"
              onClick={() => {
                setView(selected);
                onClose();
              }}
            >
              {t("help.openPage")}
            </button>
          </article>
        </div>
      </section>
    </div>
  );
}
