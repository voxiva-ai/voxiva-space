import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CodeBrowser,
  Folder,
  Globe02,
  LayoutRight,
  XClose,
} from "@untitledui/icons";
import { IconFilePlus, IconFolderPlus } from "@/components/icons";
import { NativeBrowser } from "@/features/browser/NativeBrowser";
import { EditorTabs } from "@/features/editor/EditorTabs";
import { FileTree } from "@/features/editor/FileTree";
import { createDirectory, readBinaryFile, readTextFile, writeTextFile } from "@/features/editor/api";
import { MediaPreview } from "@/features/editor/MediaPreview";
import type { EditorTab } from "@/features/editor/types";
import { isBinaryPreviewPath, isImagePath } from "@/features/editor/types";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import {
  fileUrlFromWorkspace,
  isPreviewReloadPath,
  isWebLookingPath,
} from "@/features/browser/url";

const CodeEditor = lazy(() =>
  import("@/features/editor/CodeEditor").then((m) => ({ default: m.CodeEditor })),
);

export type AssistTab = "editor" | "browser";

const WIDTH_KEY = "voxiva-space-assist-w";
const MIN_W = 320;
const MAX_W = 720;
const DEFAULT_W = 440;

type AssistPanelProps = {
  open: boolean;
  tab: AssistTab;
  onTabChange: (tab: AssistTab) => void;
  onClose: () => void;
  pendingPath?: string | null;
  onPendingConsumed?: () => void;
  pendingUrl?: string | null;
  onPendingUrlConsumed?: () => void;
};

function baseName(path: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

export function AssistPanel({
  open,
  tab,
  onTabChange,
  onClose,
  pendingPath,
  onPendingConsumed,
  pendingUrl,
  onPendingUrlConsumed,
}: AssistPanelProps) {
  const { activeWorkspace, theme, setError, t, suggestPreviewUrl } = useSpace();
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(WIDTH_KEY));
      if (Number.isFinite(n) && n >= MIN_W && n <= MAX_W) return n;
    } catch {
      // ignore
    }
    return DEFAULT_W;
  });
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [assistUrl, setAssistUrl] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const dark = theme !== "light";
  const activeTab = tabs.find((item) => item.path === activePath) ?? null;

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  useEffect(() => {
    setTabs([]);
    setActivePath(null);
    setAssistUrl("");
    setTreeKey((k) => k + 1);
  }, [activeWorkspace?.id]);

  const openFile = useCallback(
    async (rel: string) => {
      if (!activeWorkspace) return;
      if (tabs.some((tabItem) => tabItem.path === rel)) {
        setActivePath(rel);
        onTabChange("editor");
        if (isWebLookingPath(rel)) {
          suggestPreviewUrl(fileUrlFromWorkspace(activeWorkspace.cwd, rel));
        }
        return;
      }
      try {
        if (isBinaryPreviewPath(rel)) {
          const file = await readBinaryFile(activeWorkspace.cwd, rel);
          const kind = isImagePath(rel) ? "image" : "binary";
          setTabs((current) => [
            ...current,
            {
              path: file.path,
              content: file.base64,
              savedContent: file.base64,
              dirty: false,
              kind,
              mime: file.mime,
              size: file.size,
            },
          ]);
          setActivePath(file.path);
          onTabChange("editor");
          return;
        }
        const file = await readTextFile(activeWorkspace.cwd, rel);
        setTabs((current) => [
          ...current,
          {
            path: file.path,
            content: file.content,
            savedContent: file.content,
            dirty: false,
            kind: "text",
          },
        ]);
        setActivePath(file.path);
        onTabChange("editor");
        if (isWebLookingPath(file.path)) {
          suggestPreviewUrl(fileUrlFromWorkspace(activeWorkspace.cwd, file.path));
        }
      } catch (error) {
        setError(clientError(error));
      }
    },
    [activeWorkspace, onTabChange, setError, suggestPreviewUrl, tabs],
  );

  useEffect(() => {
    if (!open || !pendingPath) return;
    void openFile(pendingPath).finally(() => onPendingConsumed?.());
  }, [open, openFile, onPendingConsumed, pendingPath]);

  useEffect(() => {
    if (!open || !pendingUrl) return;
    setAssistUrl(pendingUrl);
    onTabChange("browser");
    onPendingUrlConsumed?.();
  }, [open, pendingUrl, onPendingUrlConsumed, onTabChange]);

  useEffect(() => {
    const active = open && tab === "browser";
    window.dispatchEvent(new CustomEvent("voxiva-pane-drag", { detail: { active } }));
    return () => {
      if (active) {
        window.dispatchEvent(new CustomEvent("voxiva-pane-drag", { detail: { active: false } }));
      }
    };
  }, [open, tab]);

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

  async function saveActive() {
    if (!activeWorkspace || !activeTab?.dirty) return;
    if (activeTab.kind && activeTab.kind !== "text") return;
    try {
      await writeTextFile(activeWorkspace.cwd, activeTab.path, activeTab.content);
      setTabs((current) =>
        current.map((item) =>
          item.path === activeTab.path
            ? { ...item, savedContent: item.content, dirty: false }
            : item,
        ),
      );
      if (isPreviewReloadPath(activeTab.path)) {
        window.dispatchEvent(new Event("voxiva-preview-reload"));
      }
    } catch (error) {
      setError(clientError(error));
    }
  }

  useEffect(() => {
    if (!open || tab !== "editor") return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveActive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tab, activeTab, activeWorkspace]);

  async function createFile() {
    if (!activeWorkspace) return;
    const name = window.prompt(t("editor.newFilePrompt"), "untitled.ts");
    if (!name?.trim()) return;
    const rel = name.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    try {
      await writeTextFile(activeWorkspace.cwd, rel, "");
      setTreeKey((k) => k + 1);
      await openFile(rel);
    } catch (error) {
      setError(clientError(error));
    }
  }

  async function createFolder() {
    if (!activeWorkspace) return;
    const name = window.prompt(t("editor.newFolderPrompt"), "new-folder");
    if (!name?.trim()) return;
    try {
      await createDirectory(activeWorkspace.cwd, name.trim());
      setTreeKey((k) => k + 1);
    } catch (error) {
      setError(clientError(error));
    }
  }

  function closeTab(path: string) {
    const index = tabs.findIndex((item) => item.path === path);
    const remaining = tabs.filter((item) => item.path !== path);
    setTabs(remaining);
    if (activePath === path) {
      setActivePath(remaining[Math.min(index, remaining.length - 1)]?.path ?? null);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <aside className={`vs-assist is-open`} style={{ width }} aria-label={t("assist.title")}>
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
            className={`vs-assistTab${tab === "editor" ? " is-active" : ""}`}
            aria-selected={tab === "editor"}
            title={t("assist.editor")}
            onClick={() => onTabChange("editor")}
          >
            <CodeBrowser size={15} aria-hidden />
            <span>{t("assist.editor")}</span>
          </button>
          <button
            type="button"
            role="tab"
            className={`vs-assistTab${tab === "browser" ? " is-active" : ""}`}
            aria-selected={tab === "browser"}
            title={t("assist.browser")}
            onClick={() => onTabChange("browser")}
          >
            <Globe02 size={15} aria-hidden />
            <span>{t("assist.browser")}</span>
          </button>
        </div>
        <button
          type="button"
          className="vs-iconBtn"
          title={t("assist.close")}
          aria-label={t("assist.close")}
          onClick={onClose}
        >
          <XClose size={15} aria-hidden />
        </button>
      </header>

      {!activeWorkspace ? (
        <div className="vs-assistEmpty">
          <LayoutRight size={22} aria-hidden />
          <p>{t("assist.needWorkspace")}</p>
        </div>
      ) : (
        <div className="vs-assistBody">
          {tab === "editor" && (
            <div className="vs-assistEditor">
              <div className="vs-assistEditorToolbar">
                <button
                  type="button"
                  className={`vs-assistFilesToggle${filesOpen ? " is-active" : ""}`}
                  title={t("assist.files")}
                  aria-pressed={filesOpen}
                  onClick={() => setFilesOpen((v) => !v)}
                >
                  <Folder size={14} aria-hidden />
                </button>
                <strong title={activeWorkspace.cwd}>{baseName(activeWorkspace.cwd)}</strong>
                <span className="vs-spacer" />
                <button type="button" className="vs-iconBtn" title={t("editor.newFile")} onClick={() => void createFile()}>
                  <IconFilePlus size={14} />
                </button>
                <button
                  type="button"
                  className="vs-iconBtn"
                  title={t("editor.newFolder")}
                  onClick={() => void createFolder()}
                >
                  <IconFolderPlus size={14} />
                </button>
              </div>
              <div className={`vs-assistEditorBody${filesOpen ? " has-files" : ""}`}>
                {filesOpen && (
                  <aside className="vs-assistFiles">
                    <FileTree
                      key={`${activeWorkspace.cwd}:${treeKey}`}
                      root={activeWorkspace.cwd}
                      activePath={activePath}
                      onOpen={(rel) => void openFile(rel)}
                      onError={(error) => setError(clientError(error))}
                      loadingLabel={t("editor.loading")}
                      emptyLabel={t("editor.emptyFolder")}
                    />
                  </aside>
                )}
                <div className="vs-assistCode">
                  {tabs.length > 0 && (
                    <EditorTabs
                      tabs={tabs}
                      activePath={activePath}
                      onSelect={setActivePath}
                      onClose={closeTab}
                    />
                  )}
                  {activeTab ? (
                    <Suspense fallback={<div className="vs-assistEmpty">{t("editor.loading")}</div>}>
                      {activeTab.kind === "image" || activeTab.kind === "binary" ? (
                        <MediaPreview
                          path={activeTab.path}
                          mime={activeTab.mime || "application/octet-stream"}
                          base64={activeTab.content}
                          size={activeTab.size}
                          kind={activeTab.kind}
                        />
                      ) : (
                        <CodeEditor
                          path={activeTab.path}
                          value={activeTab.content}
                          dark={dark}
                          onChange={(content) => {
                            setTabs((current) =>
                              current.map((item) =>
                                item.path === activeTab.path
                                  ? {
                                      ...item,
                                      content,
                                      dirty: content !== item.savedContent,
                                    }
                                  : item,
                              ),
                            );
                          }}
                        />
                      )}
                    </Suspense>
                  ) : (
                    <div className="vs-assistEmpty">
                      <p>{t("assist.pickFile")}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "browser" && (
            <div className="vs-assistBrowser">
              <NativeBrowser
                instanceId="assist"
                url={assistUrl}
                onUrlChange={setAssistUrl}
              />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
