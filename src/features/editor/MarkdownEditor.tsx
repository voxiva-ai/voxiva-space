import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconOpenPreview } from "@/components/icons";
import { CodeEditor, type CodeEditorHandle } from "./CodeEditor";
import { MarkdownPreview, type MarkdownPreviewHandle } from "./MarkdownPreview";
import { loadMarkdownPreviewOpen, saveMarkdownPreviewOpen } from "./markdown";
import { useSpace } from "@/features/workspace/SpaceContext";

export function MarkdownEditor({
  path,
  value,
  dark,
  onChange,
}: {
  path: string;
  value: string;
  dark: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useSpace();
  const [previewOpen, setPreviewOpen] = useState(() => loadMarkdownPreviewOpen());
  const editorRef = useRef<CodeEditorHandle>(null);
  const previewRef = useRef<MarkdownPreviewHandle>(null);
  const syncFrom = useRef<"editor" | "preview" | null>(null);
  const unlockRaf = useRef(0);

  useEffect(() => {
    saveMarkdownPreviewOpen(previewOpen);
  }, [previewOpen]);

  useLayoutEffect(() => {
    if (!previewOpen) {
      editorRef.current?.onScroll(null);
      previewRef.current?.onScroll(null);
      return;
    }

    const unlockSoon = () => {
      cancelAnimationFrame(unlockRaf.current);
      unlockRaf.current = requestAnimationFrame(() => {
        unlockRaf.current = requestAnimationFrame(() => {
          syncFrom.current = null;
        });
      });
    };

    editorRef.current?.onScroll((ratio) => {
      if (syncFrom.current === "preview") return;
      syncFrom.current = "editor";
      previewRef.current?.scrollRatio(ratio);
      unlockSoon();
    });

    previewRef.current?.onScroll((ratio) => {
      if (syncFrom.current === "editor") return;
      syncFrom.current = "preview";
      editorRef.current?.scrollRatio(ratio);
      unlockSoon();
    });

    return () => {
      editorRef.current?.onScroll(null);
      previewRef.current?.onScroll(null);
      cancelAnimationFrame(unlockRaf.current);
    };
  }, [previewOpen]);

  return (
    <div className={`vs-mdEditor${previewOpen ? " is-split" : " is-source"}`}>
      <div className="vs-mdEditorChrome">
        <span className="vs-mdEditorChromeLabel">{path.split(/[\\/]/).pop()}</span>
        <div className="vs-mdEditorActions">
          <button
            type="button"
            className="vs-iconBtn vs-mdPreviewBtn"
            title={previewOpen ? t("editor.mdClosePreview") : t("editor.mdOpenPreview")}
            aria-label={previewOpen ? t("editor.mdClosePreview") : t("editor.mdOpenPreview")}
            aria-pressed={previewOpen}
            onClick={() => setPreviewOpen((v) => !v)}
          >
            <IconOpenPreview size={16} />
          </button>
        </div>
      </div>

      <div className="vs-mdEditorBody">
        <div className="vs-mdEditorPane">
          <CodeEditor
            ref={editorRef}
            path={path}
            value={value}
            dark={dark}
            onChange={onChange}
          />
        </div>
        {previewOpen ? (
          <div className="vs-mdEditorPane vs-mdEditorPanePreview">
            <div className="vs-mdPreviewHeader">
              <strong>{t("editor.mdPreview")}</strong>
              <span>Markdown Preview</span>
            </div>
            <MarkdownPreview ref={previewRef} content={value} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
