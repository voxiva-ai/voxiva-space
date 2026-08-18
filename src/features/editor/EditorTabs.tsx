import type { EditorTab } from "./types";
import { IconX } from "@/components/icons";
import { MaterialFileIcon } from "./MaterialFileIcon";

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
      {tabs.map((tab) => {
        const name = baseName(tab.path);
        return (
          <div
            key={tab.path}
            className={`vs-editorTab${tab.path === activePath ? " is-active" : ""}${
              tab.dirty ? " is-dirty" : ""
            }`}
            role="tab"
            aria-selected={tab.path === activePath}
          >
            <button type="button" className="vs-editorTabSelect" onClick={() => onSelect(tab.path)}>
              <MaterialFileIcon name={name} isDir={false} />
              <span>{name}</span>
              {tab.dirty ? <span className="vs-editorDirty is-dirty" aria-hidden /> : null}
            </button>
            <button
              type="button"
              className="vs-editorTabClose"
              aria-label={`Close ${name}`}
              onClick={() => onClose(tab.path)}
            >
              <IconX size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
