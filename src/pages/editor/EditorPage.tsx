import { useCallback, useEffect, useMemo, useState } from "react";
import { IconFilePlus, IconFolderPlus, IconRefresh, IconSave, IconSaveAll } from "@/components/icons";
import { ConfirmDialog, PromptDialog } from "@/components/PromptDialog";
import type { ThemeId } from "@/features/workspace/persist";
import { getTheme } from "@/features/theme";
import { CodeEditor } from "@/features/editor/CodeEditor";
import { EditorTabs } from "@/features/editor/EditorTabs";
import { FileTree } from "@/features/editor/FileTree";
import { createDirectory, getWorkspaceFileInfo, readTextFile, writeTextFile } from "@/features/editor/api";
import { MediaPreview } from "@/features/editor/MediaPreview";
import { MarkdownEditor } from "@/features/editor/MarkdownEditor";
import { loadEditorSession, saveEditorSession } from "@/features/editor/session";
import {
  editorKindForPath,
  isBinaryPreviewPath,
  isMarkdownPath,
  type EditorTab,
} from "@/features/editor/types";
import { useSpace } from "@/features/workspace/SpaceContext";
import { isPreviewReloadPath } from "@/features/browser/url";

function baseName(path: string) {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}

function normalizeRelPath(raw: string) {
  return raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function EditorWorkspace({
  workspaceId,
  root,
  theme,
}: {
  workspaceId: string;
  root: string;
  theme: ThemeId;
}) {
  const saved = loadEditorSession(workspaceId);
  const { setError, setEditorDirty, t } = useSpace();
  const [tabs, setTabs] = useState<EditorTab[]>(() => saved?.tabs ?? []);
  const [activePath, setActivePath] = useState<string | null>(() => saved?.activePath ?? null);
  const [opening, setOpening] = useState<string | null>(null);
  const [treeKey, setTreeKey] = useState(0);
  const [promptKind, setPromptKind] = useState<"file" | "folder" | null>(null);
  const [confirmClosePath, setConfirmClosePath] = useState<string | null>(null);
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activePath) ?? null,
    [tabs, activePath],
  );
  const dirtyCount = useMemo(() => tabs.filter((tab) => tab.dirty).length, [tabs]);

  useEffect(() => {
    saveEditorSession(workspaceId, { tabs, activePath });
  }, [workspaceId, tabs, activePath]);

  useEffect(() => {
    setEditorDirty(dirtyCount > 0);
    return () => setEditorDirty(false);
  }, [dirtyCount, setEditorDirty]);

  const showError = useCallback(
    (prefix: string, error: unknown) => {
      const detail = String(error).replace(/^Error:\s*/i, "").slice(0, 140);
      setError(detail ? `${prefix} ${detail}` : prefix);
    },
    [setError],
  );
  const handleTreeError = useCallback(
    (error: unknown) => showError(t("editor.treeError"), error),
    [showError, t],
  );

  const openFile = useCallback(
    async (path: string) => {
      if (tabs.some((tab) => tab.path === path)) {
        setActivePath(path);
        return;
      }
      setOpening(path);
      try {
        if (isBinaryPreviewPath(path)) {
          const file = await getWorkspaceFileInfo(root, path);
          setTabs((current) => [
            ...current,
            {
              path: file.path,
              content: "",
              savedContent: "",
              dirty: false,
              kind: editorKindForPath(file.path),
              mime: file.mime,
              size: file.size,
              absPath: file.absolutePath,
            },
          ]);
          setActivePath(file.path);
          return;
        }
        const file = await readTextFile(root, path);
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
      } catch (error) {
        showError(t("editor.readError"), error);
      } finally {
        setOpening(null);
      }
    },
    [root, showError, t, tabs],
  );

  const saveTab = useCallback(
    async (tab: EditorTab) => {
      if (tab.kind && tab.kind !== "text") return;
      await writeTextFile(root, tab.path, tab.content);
      setTabs((current) =>
        current.map((item) =>
          item.path === tab.path
            ? { ...item, savedContent: item.content, dirty: false }
            : item,
        ),
      );
      if (isPreviewReloadPath(tab.path)) {
        window.dispatchEvent(new Event("voxiva-preview-reload"));
      }
    },
    [root],
  );

  const saveActive = useCallback(async () => {
    if (!activeTab || !activeTab.dirty) return;
    try {
      await saveTab(activeTab);
    } catch (error) {
      showError(t("editor.writeError"), error);
    }
  }, [activeTab, saveTab, showError, t]);

  const saveAll = useCallback(async () => {
    const dirty = tabs.filter((tab) => tab.dirty && (!tab.kind || tab.kind === "text"));
    if (!dirty.length) return;
    try {
      for (const tab of dirty) {
        await saveTab(tab);
      }
    } catch (error) {
      showError(t("editor.writeError"), error);
    }
  }, [saveTab, showError, t, tabs]);

  const createFile = useCallback(
    async (raw: string) => {
      const path = normalizeRelPath(raw);
      if (!path || path.endsWith("/")) {
        setError(t("editor.writeError"));
        return;
      }
      try {
        const created = await writeTextFile(root, path, "");
        setTreeKey((n) => n + 1);
        setTabs((current) => {
          if (current.some((tab) => tab.path === created.path)) return current;
          return [
            ...current,
            {
              path: created.path,
              content: "",
              savedContent: "",
              dirty: false,
            },
          ];
        });
        setActivePath(created.path);
      } catch (error) {
        showError(t("editor.writeError"), error);
      }
    },
    [root, setError, showError, t],
  );

  const createFolder = useCallback(
    async (raw: string) => {
      const path = normalizeRelPath(raw).replace(/\/+$/, "");
      if (!path) {
        setError(t("editor.writeError"));
        return;
      }
      try {
        await createDirectory(root, path);
        setTreeKey((n) => n + 1);
      } catch (error) {
        showError(t("editor.writeError"), error);
      }
    },
    [root, setError, showError, t],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (event.shiftKey) void saveAll();
      else void saveActive();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveActive, saveAll]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyCount === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyCount]);

  function closeTab(path: string) {
    const closing = tabs.find((tab) => tab.path === path);
    if (closing?.dirty) {
      setConfirmClosePath(path);
      return;
    }
    finishCloseTab(path);
  }

  function finishCloseTab(path: string) {
    const index = tabs.findIndex((tab) => tab.path === path);
    const remaining = tabs.filter((tab) => tab.path !== path);
    setTabs(remaining);
    if (activePath === path) {
      setActivePath(remaining[Math.min(index, remaining.length - 1)]?.path ?? null);
    }
  }

  function changeActive(content: string) {
    if (!activePath) return;
    setTabs((current) =>
      current.map((tab) =>
        tab.path === activePath
          ? { ...tab, content, dirty: content !== tab.savedContent }
          : tab,
      ),
    );
  }

  return (
    <section className="vs-editor">
      <div className="vs-editorToolbar">
        <div>
          <strong>{t("editor.explorer")}</strong>
          <span>{baseName(root)}</span>
        </div>
        <div className="vs-editorToolbarActions">
          <button
            type="button"
            className="vs-iconBtn"
            title={`${t("editor.save")} (Ctrl+S)`}
            aria-label={t("editor.save")}
            disabled={!activeTab?.dirty || (activeTab.kind != null && activeTab.kind !== "text")}
            onClick={() => void saveActive()}
          >
            <IconSave size={15} />
          </button>
          <button
            type="button"
            className="vs-iconBtn"
            title={`${t("editor.saveAll")} (Ctrl+Shift+S)`}
            aria-label={t("editor.saveAll")}
            disabled={dirtyCount === 0}
            onClick={() => void saveAll()}
          >
            <IconSaveAll size={15} />
          </button>
          <span className={dirtyCount ? "is-dirty" : ""}>
            {dirtyCount
              ? `${t("editor.unsaved")} (${dirtyCount})`
              : activeTab
                ? t("editor.saved")
                : ""}
          </span>
        </div>
      </div>

      <div className="vs-editorBody">
        <aside className="vs-editorExplorer">
          <div className="vs-editorExplorerTitle" title={root}>
            <span>{baseName(root)}</span>
            <span className="vs-editorExplorerActions">
              <button
                type="button"
                className="vs-iconBtn"
                title={t("editor.refresh")}
                aria-label={t("editor.refresh")}
                onClick={() => setTreeKey((n) => n + 1)}
              >
                <IconRefresh size={14} />
              </button>
              <button
                type="button"
                className="vs-iconBtn"
                title={t("editor.newFile")}
                aria-label={t("editor.newFile")}
                onClick={() => setPromptKind("file")}
              >
                <IconFilePlus size={14} />
              </button>
              <button
                type="button"
                className="vs-iconBtn"
                title={t("editor.newFolder")}
                aria-label={t("editor.newFolder")}
                onClick={() => setPromptKind("folder")}
              >
                <IconFolderPlus size={14} />
              </button>
            </span>
          </div>
          <FileTree
            key={`${root}:${treeKey}`}
            root={root}
            activePath={activePath}
            onOpen={(path) => void openFile(path)}
            onError={handleTreeError}
            loadingLabel={t("editor.loading")}
            emptyLabel={t("editor.emptyFolder")}
          />
        </aside>

        <div className="vs-editorMain">
          <EditorTabs
            tabs={tabs}
            activePath={activePath}
            onSelect={setActivePath}
            onClose={closeTab}
          />
          {activeTab ? (
            <>
              {!isMarkdownPath(activeTab.path) ? (
                <div className="vs-editorBreadcrumb">{activeTab.path}</div>
              ) : null}
              <div className="vs-editorCanvas">
                {activeTab.kind === "image" || activeTab.kind === "binary" ? (
                  <MediaPreview
                    path={activeTab.path}
                    mime={activeTab.mime || "application/octet-stream"}
                    size={activeTab.size}
                    kind={activeTab.kind}
                    workspaceRoot={root}
                    absPath={activeTab.absPath}
                  />
                ) : isMarkdownPath(activeTab.path) ? (
                  <MarkdownEditor
                    key={`${activeTab.path}:${theme}`}
                    path={activeTab.path}
                    value={activeTab.content}
                    dark={getTheme(theme).appearance !== "light"}
                    onChange={changeActive}
                  />
                ) : (
                  <CodeEditor
                    key={`${activeTab.path}:${theme}`}
                    path={activeTab.path}
                    value={activeTab.content}
                    dark={getTheme(theme).appearance !== "light"}
                    onChange={changeActive}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="vs-editorEmpty">
              <strong>{opening ? t("editor.loading") : t("editor.empty")}</strong>
              <span>{opening ? root : t("editor.emptyHint")}</span>
              {!opening && (
                <div className="vs-editorEmptyActions">
                  <button type="button" className="vs-btn vs-btnPrimary" onClick={() => setPromptKind("file")}>
                    {t("editor.newFile")}
                  </button>
                  <button type="button" className="vs-btn" onClick={() => setPromptKind("folder")}>
                    {t("editor.newFolder")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <PromptDialog
        open={promptKind === "file"}
        title={t("editor.newFile")}
        label={t("editor.newFilePrompt")}
        initialValue="untitled.txt"
        confirmLabel={t("toast.ok")}
        cancelLabel={t("projects.cancel")}
        onCancel={() => setPromptKind(null)}
        onConfirm={(value) => {
          setPromptKind(null);
          void createFile(value);
        }}
      />
      <PromptDialog
        open={promptKind === "folder"}
        title={t("editor.newFolder")}
        label={t("editor.newFolderPrompt")}
        initialValue="src"
        confirmLabel={t("toast.ok")}
        cancelLabel={t("projects.cancel")}
        onCancel={() => setPromptKind(null)}
        onConfirm={(value) => {
          setPromptKind(null);
          void createFolder(value);
        }}
      />
      <ConfirmDialog
        open={Boolean(confirmClosePath)}
        title={t("editor.closeDirty")}
        body={t("editor.closeDirty")}
        confirmLabel={t("toast.ok")}
        cancelLabel={t("projects.cancel")}
        onCancel={() => setConfirmClosePath(null)}
        onConfirm={() => {
          const path = confirmClosePath;
          setConfirmClosePath(null);
          if (path) finishCloseTab(path);
        }}
      />
    </section>
  );
}

export function EditorPage() {
  const { activeWorkspace, t, theme } = useSpace();
  if (!activeWorkspace) {
    return (
      <div className="vs-empty">
        <h2>{t("nav.editor")}</h2>
        <p>{t("editor.noWorkspace")}</p>
        <button
          type="button"
          className="vs-btn vs-btnPrimary"
          onClick={() => window.dispatchEvent(new CustomEvent("voxiva-new-space"))}
        >
          {t("editor.openProjects")}
        </button>
      </div>
    );
  }
  return (
    <EditorWorkspace
      key={activeWorkspace.id}
      workspaceId={activeWorkspace.id}
      root={activeWorkspace.cwd}
      theme={theme}
    />
  );
}
