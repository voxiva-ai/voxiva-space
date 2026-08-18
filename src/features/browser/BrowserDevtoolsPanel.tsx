import { useState } from "react";
import { CodeBrowser, CursorClick02, XClose } from "@untitledui/icons";
import type { BrowserSelection } from "./api";
import { useSpace } from "@/features/workspace/SpaceContext";

export function BrowserDevtoolsPanel({
  selection,
  files,
  filesBusy,
  inspector,
  onToggleInspector,
  onClose,
}: {
  selection: BrowserSelection | null;
  files: string[];
  filesBusy: boolean;
  inspector: boolean;
  onToggleInspector: () => void;
  onClose: () => void;
}) {
  const { t } = useSpace();
  const [tab, setTab] = useState<"elements" | "styles">("elements");

  return (
    <aside className="vs-browserDevtools" data-no-drag>
      <header>
        <span>
          <CodeBrowser size={16} aria-hidden />
          DevTools
        </span>
        <button type="button" className="vs-browserToolIcon" onClick={onClose} aria-label={t("term.close")}>
          <XClose size={16} aria-hidden />
        </button>
      </header>
      <div className="vs-browserDevtoolsTabs">
        <button
          type="button"
          className={tab === "elements" ? "is-active" : ""}
          onClick={() => setTab("elements")}
        >
          Elements
        </button>
        <button
          type="button"
          className={tab === "styles" ? "is-active" : ""}
          onClick={() => setTab("styles")}
        >
          Styles
        </button>
      </div>
      <button
        type="button"
        className={`vs-browserPickAction${inspector ? " is-active" : ""}`}
        onClick={onToggleInspector}
      >
        <CursorClick02 size={16} aria-hidden />
        {t("browser.inspect")}
      </button>
      {!selection ? (
        <div className="vs-browserDevtoolsEmpty">{t("browser.inspectHint")}</div>
      ) : tab === "elements" ? (
        <div className="vs-browserDevtoolsBody">
          <strong>{selection.component || selection.tag}</strong>
          <code>{selection.selector}</code>
          <small>
            {selection.boundingBox.width} × {selection.boundingBox.height}
          </small>
          <h4>{t("browser.relatedFiles")}</h4>
          <div className="vs-browserDevtoolsFiles">
            {filesBusy
              ? t("browser.findingFiles")
              : files.length
                ? files.map((file) => <code key={file}>{file}</code>)
                : t("browser.filesNotFound")}
          </div>
          <h4>HTML</h4>
          <pre>{selection.html}</pre>
        </div>
      ) : (
        <div className="vs-browserDevtoolsStyles">
          {Object.entries(selection.computedStyles).map(([property, value]) => (
            <div key={property}>
              <span>{property}</span>
              <code>{value}</code>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
