import type { EditorTab } from "./types";
import { IconX } from "@/components/icons";

function baseName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

export function EditorTabs({
  tabs,
  activePath,
  onSelect,
  onClose,
}: {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  return (
    <div className="vs-editorTabs" role="tablist" aria-label="Open files">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`vs-editorTab${tab.path === activePath ? " is-active" : ""}`}
          role="tab"
          aria-selected={tab.path === activePath}
        >
          <button type="button" className="vs-editorTabSelect" onClick={() => onSelect(tab.path)}>
            <span className={`vs-editorDirty${tab.dirty ? " is-dirty" : ""}`} />
            <span>{baseName(tab.path)}</span>
          </button>
          <button
            type="button"
            className="vs-editorTabClose"
            aria-label={`Close ${baseName(tab.path)}`}
            onClick={() => onClose(tab.path)}
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
