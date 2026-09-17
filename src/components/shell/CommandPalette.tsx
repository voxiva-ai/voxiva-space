import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { SPACE_COLOR_HEX } from "@/lib/types";
import { formatHotkey, loadHotkeys } from "@/features/hotkeys/bindings";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  rail?: string | null;
  run: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  extraItems?: CommandItem[];
};

function fuzzyScore(query: string, text: string) {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) qi += 1;
  }
  return qi === q.length ? 10 : 0;
}

/** Command palette — Ctrl/Cmd+Shift+P */
export function CommandPalette({ open, onClose, extraItems = [] }: Props) {
  const {
    workspaces,
    activeWorkspace,
    selectWorkspace,
    spawnInFocused,
    openBrowserInFocused,
    toggleWorkspacePinned,
    moveWorkspaceToTop,
    forkFocused,
    equalizeSplits,
    toggleMaximizeFocusedPane,
    createWorkspace,
    openNewSpaceFromLayout,
    openWorkspaceInVsCodeInline,
    toggleBrowserFocusMode,
    savedLayouts,
    t,
  } = useSpace();
  const { setView } = useView();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const baseItems = useMemo<CommandItem[]>(() => {
    const hk = loadHotkeys();
    const newGroup = t("palette.group.new");
    const actionsGroup = t("palette.group.actions");

    const actions: CommandItem[] = [
      {
        id: "plus:new-space",
        label: t("plus.newSpace"),
        hint: formatHotkey(hk.newSpace),
        group: newGroup,
        run: () => window.dispatchEvent(new Event("voxiva-new-space")),
      },
      {
        id: "plus:duplicate",
        label: t("plus.duplicate"),
        group: newGroup,
        run: () => {
          if (!activeWorkspace) return;
          void createWorkspace({
            name: `${activeWorkspace.name} copy`,
            cwd: activeWorkspace.cwd,
            agentIds: [],
          });
        },
      },
      ...savedLayouts.map((layout) => ({
        id: `plus:layout:${layout.id}`,
        label: t("plus.fromLayout").replace("{name}", layout.name),
        group: newGroup,
        run: () => void openNewSpaceFromLayout(layout.id),
      })),
      {
        id: "term",
        label: t("palette.newTerminal"),
        hint: formatHotkey(hk.newTab),
        group: actionsGroup,
        run: () => void spawnInFocused({ title: "Shell", accent: "green", mode: "tab" }),
      },
      {
        id: "browser",
        label: t("palette.newBrowser"),
        hint: formatHotkey(hk.newBrowserTab),
        group: actionsGroup,
        run: () => void openBrowserInFocused(undefined, "tab"),
      },
      {
        id: "fork-tab",
        label: t("palette.forkTab"),
        hint: "fork tab",
        group: actionsGroup,
        run: () => void forkFocused("tab"),
      },
      {
        id: "fork-right",
        label: t("palette.forkRight"),
        hint: "fork right",
        group: actionsGroup,
        run: () => void forkFocused("right"),
      },
      {
        id: "fork-workspace",
        label: t("palette.forkWorkspace"),
        hint: "fork workspace",
        group: actionsGroup,
        run: () => void forkFocused("workspace"),
      },
      {
        id: "pin",
        label: t("palette.pin"),
        hint: "pin",
        group: actionsGroup,
        run: () => {
          if (activeWorkspace) toggleWorkspacePinned(activeWorkspace.id);
        },
      },
      {
        id: "top",
        label: t("palette.moveTop"),
        hint: "top",
        group: actionsGroup,
        run: () => {
          if (activeWorkspace) moveWorkspaceToTop(activeWorkspace.id);
        },
      },
      {
        id: "maximize",
        label: t("palette.maximize"),
        hint: formatHotkey(hk.maximizePane),
        group: actionsGroup,
        run: () => toggleMaximizeFocusedPane(),
      },
      {
        id: "equalize",
        label: t("palette.equalize"),
        hint: formatHotkey(hk.equalizeSplits),
        group: actionsGroup,
        run: () => equalizeSplits(),
      },
      {
        id: "vscode-inline",
        label: t("vscode.openInline"),
        hint: activeWorkspace?.cwd || undefined,
        group: actionsGroup,
        run: () => void openWorkspaceInVsCodeInline(activeWorkspace?.cwd || undefined),
      },
      {
        id: "vscode-focus",
        label: t("vscode.focusModeToggle"),
        hint: formatHotkey(hk.browserFocusMode),
        group: actionsGroup,
        run: () => toggleBrowserFocusMode(),
      },
      {
        id: "settings",
        label: t("nav.settings"),
        hint: formatHotkey(hk.settings),
        group: actionsGroup,
        run: () => setView("settings"),
      },
      {
        id: "vault",
        label: t("palette.openVault"),
        hint: formatHotkey(hk.history),
        group: actionsGroup,
        run: () => {
          window.dispatchEvent(new CustomEvent("voxiva-open-vault"));
        },
      },
    ];

    const spaces: CommandItem[] = workspaces.map((ws) => ({
      id: `ws:${ws.id}`,
      label: ws.name,
      hint: [ws.branch, ws.cwd].filter(Boolean).join(" · ") || undefined,
      group: t("palette.group.spaces"),
      rail:
        ws.color !== "default" && ws.color in SPACE_COLOR_HEX
          ? SPACE_COLOR_HEX[ws.color as keyof typeof SPACE_COLOR_HEX]
          : null,
      run: () => {
        selectWorkspace(ws.id);
        setView("space");
      },
    }));

    return [...actions, ...spaces, ...extraItems];
  }, [
    activeWorkspace,
    createWorkspace,
    equalizeSplits,
    extraItems,
    forkFocused,
    moveWorkspaceToTop,
    openBrowserInFocused,
    openNewSpaceFromLayout,
    openWorkspaceInVsCodeInline,
    toggleBrowserFocusMode,
    savedLayouts,
    selectWorkspace,
    setView,
    spawnInFocused,
    t,
    toggleMaximizeFocusedPane,
    toggleWorkspacePinned,
    workspaces,
  ]);

  const filtered = useMemo(() => {
    const scored = baseItems
      .map((item) => ({
        item,
        score: Math.max(
          fuzzyScore(query, item.label),
          fuzzyScore(query, item.hint || ""),
          fuzzyScore(query, item.group || ""),
        ),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Keep group order stable when unscored (empty query).
        return 0;
      });
    if (!query.trim()) return baseItems;
    return scored.map((row) => row.item);
  }, [baseItems, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-palette-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const item = filtered[active];
        if (!item) return;
        onClose();
        item.run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, filtered, onClose, open]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="vs-paletteRoot">
      <button type="button" className="vs-paletteScrim" aria-label={t("palette.close")} onClick={onClose} />
      <div className="vs-palette" role="dialog" aria-label={t("palette.title")}>
        <input
          ref={inputRef}
          className="vs-paletteInput"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("palette.placeholder")}
          spellCheck={false}
        />
        <div className="vs-paletteList" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="vs-paletteEmpty">{t("palette.empty")}</div>
          ) : (
            filtered.map((item, index) => {
              const showGroup = item.group && item.group !== lastGroup;
              if (item.group) lastGroup = item.group;
              return (
                <div key={item.id}>
                  {showGroup ? <div className="vs-paletteGroup">{item.group}</div> : null}
                  <button
                    type="button"
                    data-palette-index={index}
                    className={`vs-paletteItem${index === active ? " is-active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      onClose();
                      item.run();
                    }}
                  >
                    <span
                      className={`vs-paletteItemRail${item.rail ? " is-on" : ""}`}
                      style={
                        item.rail ? ({ ["--vs-ws-rail"]: item.rail } as CSSProperties) : undefined
                      }
                    />
                    <span className="vs-paletteItemLabel">{item.label}</span>
                    {item.hint ? <span className="vs-paletteItemHint">{item.hint}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="vs-paletteFoot">
          <span>
            <kbd className="vs-paletteKbd">↑↓</kbd> {t("palette.nav")}
          </span>
          <span>
            <kbd className="vs-paletteKbd">Enter</kbd> {t("palette.run")}
          </span>
          <span>
            <kbd className="vs-paletteKbd">Esc</kbd> {t("palette.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
