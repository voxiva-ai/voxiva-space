import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder as FolderIcon } from "@untitledui/icons";
import { listDirectory, getWorkspaceFileInfo } from "@/features/editor/api";
import { isPanePreviewPath, type FileEntry } from "@/features/editor/types";
import { MaterialFileIcon } from "@/features/editor/MaterialFileIcon";
import { useSpace } from "@/features/workspace/SpaceContext";
import { openInExplorer } from "@/features/terminal/api";

const OPEN_KEY = "voxiva-space-filetree-open";
const WIDTH_KEY = "voxiva-space-filetree-width";
const COLLAPSED_KEY = "voxiva-space-filetree-collapsed";

function loadOpenSet(workspaceId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${OPEN_KEY}:${workspaceId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveOpenSet(workspaceId: string, open: Set<string>) {
  try {
    localStorage.setItem(`${OPEN_KEY}:${workspaceId}`, JSON.stringify([...open]));
  } catch {
    /* ignore */
  }
}

function TreeNode({
  entry,
  depth,
  root,
  openPaths,
  onToggle,
  onOpenFile,
  childrenCache,
  setChildrenCache,
}: {
  entry: FileEntry;
  depth: number;
  root: string;
  openPaths: Set<string>;
  onToggle: (path: string) => void;
  onOpenFile: (entry: FileEntry) => void;
  childrenCache: Record<string, FileEntry[]>;
  setChildrenCache: React.Dispatch<React.SetStateAction<Record<string, FileEntry[]>>>;
}) {
  const expanded = entry.isDir && openPaths.has(entry.path);
  const kids = childrenCache[entry.path];

  useEffect(() => {
    if (!expanded || kids) return;
    let cancelled = false;
    void listDirectory(root, entry.path)
      .then((list) => {
        if (!cancelled) {
          setChildrenCache((prev) => ({ ...prev, [entry.path]: list }));
        }
      })
      .catch(() => {
        if (!cancelled) setChildrenCache((prev) => ({ ...prev, [entry.path]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, kids, root, entry.path, setChildrenCache]);

  return (
    <div className="vs-fileTreeNode">
      <button
        type="button"
        className="vs-fileTreeRow"
        style={{ paddingLeft: `${0.35 + depth * 0.75}rem` }}
        onClick={() => (entry.isDir ? onToggle(entry.path) : onOpenFile(entry))}
        title={entry.path}
      >
        <span className="vs-fileTreeChevron" aria-hidden>
          {entry.isDir ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="vs-fileTreeChevronSpacer" />
          )}
        </span>
        <MaterialFileIcon name={entry.name} isDir={entry.isDir} open={expanded} size={16} />
        <span className="vs-fileTreeName">{entry.name}</span>
      </button>
      {expanded && kids
        ? kids.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              root={root}
              openPaths={openPaths}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              childrenCache={childrenCache}
              setChildrenCache={setChildrenCache}
            />
          ))
        : null}
    </div>
  );
}

export function FileTreePanel() {
  const { activeWorkspace, openMediaPreviewAt, t } = useSpace();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(WIDTH_KEY));
      return Number.isFinite(n) && n >= 160 && n <= 420 ? n : 220;
    } catch {
      return 220;
    }
  });
  const [rootEntries, setRootEntries] = useState<FileEntry[]>([]);
  const [childrenCache, setChildrenCache] = useState<Record<string, FileEntry[]>>({});
  const [openPaths, setOpenPaths] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const workspaceId = activeWorkspace?.id ?? "";
  const root = activeWorkspace?.cwd ?? "";

  useEffect(() => {
    if (!workspaceId) return;
    setOpenPaths(loadOpenSet(workspaceId));
    setChildrenCache({});
  }, [workspaceId]);

  useEffect(() => {
    if (!root) {
      setRootEntries([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    void listDirectory(root, ".")
      .then((list) => {
        if (!cancelled) setRootEntries(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root]);

  const onToggle = useCallback(
    (path: string) => {
      setOpenPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        if (workspaceId) saveOpenSet(workspaceId, next);
        return next;
      });
    },
    [workspaceId],
  );

  const onOpenFile = useCallback(
    async (entry: FileEntry) => {
      if (!activeWorkspace || entry.isDir) return;
      try {
        const info = await getWorkspaceFileInfo(root, entry.path);
        if (isPanePreviewPath(entry.path) || isPanePreviewPath(info.absolutePath)) {
          openMediaPreviewAt(activeWorkspace.focusedPaneId, "center", info.absolutePath);
          return;
        }
        await openInExplorer(info.absolutePath);
      } catch {
        /* ignore */
      }
    },
    [activeWorkspace, openMediaPreviewAt, root],
  );

  const rootLabel = useMemo(() => {
    const parts = root.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || root || t("files.title");
  }, [root, t]);

  if (!activeWorkspace) return null;

  if (collapsed) {
    return (
      <aside className="vs-fileTree is-collapsed" aria-label={t("files.title")}>
        <button
          type="button"
          className="vs-fileTreeExpandBtn"
          title={t("files.show")}
          aria-label={t("files.show")}
          onClick={() => {
            setCollapsed(false);
            try {
              localStorage.setItem(COLLAPSED_KEY, "0");
            } catch {
              /* ignore */
            }
          }}
        >
          <FolderIcon size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="vs-fileTree" style={{ width }} aria-label={t("files.title")}>
      <header className="vs-fileTreeHead">
        <strong className="vs-fileTreeTitle" title={root}>
          {rootLabel}
        </strong>
        <button
          type="button"
          className="vs-fileTreeHideBtn"
          title={t("files.hide")}
          aria-label={t("files.hide")}
          onClick={() => {
            setCollapsed(true);
            try {
              localStorage.setItem(COLLAPSED_KEY, "1");
            } catch {
              /* ignore */
            }
          }}
        >
          ×
        </button>
      </header>
      <div className="vs-fileTreeScroll">
        {busy && !rootEntries.length ? <p className="vs-fileTreeHint">{t("files.loading")}</p> : null}
        {error ? <p className="vs-fileTreeHint is-error">{error}</p> : null}
        {!busy && !error && !rootEntries.length ? (
          <p className="vs-fileTreeHint">{t("files.empty")}</p>
        ) : null}
        {rootEntries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            root={root}
            openPaths={openPaths}
            onToggle={onToggle}
            onOpenFile={(e) => void onOpenFile(e)}
            childrenCache={childrenCache}
            setChildrenCache={setChildrenCache}
          />
        ))}
      </div>
      <div
        className="vs-fileTreeResizer"
        onPointerDown={(ev) => {
          ev.preventDefault();
          const startX = ev.clientX;
          const startW = width;
          let latest = startW;
          const onMove = (e: PointerEvent) => {
            latest = Math.min(420, Math.max(160, startW + (e.clientX - startX)));
            setWidth(latest);
          };
          const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            try {
              localStorage.setItem(WIDTH_KEY, String(latest));
            } catch {
              /* ignore */
            }
          };
          document.addEventListener("pointermove", onMove);
          document.addEventListener("pointerup", onUp);
        }}
      />
    </aside>
  );
}
