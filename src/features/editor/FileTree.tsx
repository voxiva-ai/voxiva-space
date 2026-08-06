import { useEffect, useState, type CSSProperties } from "react";
import { ChevronRight, Loading01 } from "@untitledui/icons";
import { listDirectory } from "./api";
import { MaterialFileIcon } from "./MaterialFileIcon";
import type { FileEntry } from "./types";

function EntryRow({
  root,
  entry,
  depth,
  activePath,
  onOpen,
  onError,
}: {
  root: string;
  entry: FileEntry;
  depth: number;
  activePath: string | null;
  onOpen: (path: string) => void;
  onError: (error: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (!entry.isDir) {
      onOpen(entry.path);
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (children) return;
    setLoading(true);
    try {
      setChildren(await listDirectory(root, entry.path));
    } catch (error) {
      setExpanded(false);
      onError(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className={`vs-fileRow${entry.isDir ? " is-dir" : ""}${activePath === entry.path ? " is-active" : ""}`}
        style={{ "--vs-tree-depth": depth } as CSSProperties}
        onClick={() => void toggle()}
        title={entry.path}
        draggable={!entry.isDir}
        onDragStart={(event) => {
          if (entry.isDir) return;
          event.dataTransfer.setData("text/plain", entry.path);
          event.dataTransfer.setData("application/x-voxiva-path", entry.path);
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        <span className={`vs-fileChevron${entry.isDir ? "" : " is-blank"}`} aria-hidden>
          {entry.isDir &&
            (loading ? (
              <Loading01 size={13} className="is-loading" />
            ) : (
              <ChevronRight size={13} className={expanded ? "is-open" : ""} />
            ))}
        </span>
        <MaterialFileIcon name={entry.name} isDir={entry.isDir} open={expanded} />
        <span className="vs-fileName">{entry.name}</span>
      </button>
      {expanded &&
        children?.map((child) => (
          <EntryRow
            key={child.path}
            root={root}
            entry={child}
            depth={depth + 1}
            activePath={activePath}
            onOpen={onOpen}
            onError={onError}
          />
        ))}
    </div>
  );
}

export function FileTree({
  root,
  activePath,
  onOpen,
  onError,
  loadingLabel,
  emptyLabel,
}: {
  root: string;
  activePath: string | null;
  onOpen: (path: string) => void;
  onError: (error: unknown) => void;
  loadingLabel: string;
  emptyLabel: string;
}) {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listDirectory(root)
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((error) => {
        if (!cancelled) onError(error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, onError]);

  if (loading) return <div className="vs-fileTreeState">{loadingLabel}</div>;
  if (entries.length === 0) return <div className="vs-fileTreeState">{emptyLabel}</div>;

  return (
    <div className="vs-fileTree">
      {entries.map((entry) => (
        <EntryRow
          key={entry.path}
          root={root}
          entry={entry}
          depth={0}
          activePath={activePath}
          onOpen={onOpen}
          onError={onError}
        />
      ))}
    </div>
  );
}
