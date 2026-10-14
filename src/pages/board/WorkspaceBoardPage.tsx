import { useMemo, useState } from "react";
import { Check, ChevronRight, Circle, ClipboardList, Pin, Plus, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { collectSessionIds } from "@/features/workspace/layout";
import type { Workspace } from "@/lib/types";

type Lane = "todo" | "progress" | "review" | "done";
const LANES: Lane[] = ["todo", "progress", "review", "done"];

export function WorkspaceBoardPage() {
  const { workspaces, sessions, selectWorkspace, toggleWorkspacePinned, t } = useSpace();
  const { setView } = useView();
  const [query, setQuery] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [showPinnedSection, setShowPinnedSection] = useState(true);
  const [showEmptyLanes, setShowEmptyLanes] = useState(true);
  const [pinnedDropActive, setPinnedDropActive] = useState(false);
  const [laneFilter, setLaneFilter] = useState<Lane | "all">("all");
  const [menu, setMenu] = useState<"filter" | "settings" | null>(null);
  const filter = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => workspaces.filter((ws) =>
    `${ws.name} ${ws.branch ?? ""} ${ws.cwd}`.toLocaleLowerCase().includes(filter),
  ), [workspaces, filter]);

  const laneFor = (ws: Workspace): Lane => {
    const entries = collectSessionIds(ws.layout).map((id) => sessions[id]).filter((session) => session !== undefined);
    if (entries.some((session) => session.needsAttention)) return "review";
    if (entries.some((session) => session.status === "online" || session.status === "starting")) return "progress";
    if (entries.length > 0 && entries.every((session) => session.status === "closed")) return "done";
    return "todo";
  };

  const card = (ws: Workspace) => (
    <div className="vs-workspaceBoardCard" key={ws.id} draggable onDragStart={(event) => { event.dataTransfer.setData("text/plain", ws.id); event.dataTransfer.effectAllowed = "move"; }}>
      <button type="button" className="vs-workspaceBoardOpen" onClick={() => selectWorkspace(ws.id)} title={ws.cwd || ws.name}>
        <strong>{ws.name}</strong>
        <small>{ws.branch || ws.cwd || t("spaces.noFolder")}</small>
        <ChevronRight size={14} aria-hidden />
      </button>
      <button
        type="button"
        className={`vs-workspaceBoardPin${ws.pinned ? " is-pinned" : ""}`}
        aria-label={`${ws.pinned ? t("spaces.unpin") : t("spaces.pin")}: ${ws.name}`}
        title={ws.pinned ? t("spaces.unpin") : t("spaces.pin")}
        aria-pressed={Boolean(ws.pinned)}
        onClick={() => toggleWorkspacePinned(ws.id)}
      ><Pin size={13} aria-hidden /></button>
    </div>
  );

  return <section className="vs-workspaceBoard" aria-label={t("nav.workspaceBoard")}>
    <header className="vs-workspaceBoardHead">
      <h1>{t("nav.workspaceBoard")}</h1>
      <label className="vs-workspaceBoardSearch">
        <Search size={15} aria-hidden />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("workspaceBoard.search")} aria-label={t("workspaceBoard.search")} />
        {query && <button type="button" onClick={() => setQuery("")} aria-label={t("workspaceBoard.clear")}><X size={14} aria-hidden /></button>}
      </label>
      <div className="vs-workspaceBoardActions">
        <div className="vs-workspaceBoardActionWrap">
          <button type="button" className={`vs-workspaceBoardAction${menu === "filter" ? " is-active" : ""}`} onClick={() => setMenu((value) => value === "filter" ? null : "filter")} title={t("workspaceBoard.filter")} aria-label={t("workspaceBoard.filter")} aria-expanded={menu === "filter"}><SlidersHorizontal size={15} aria-hidden /></button>
          {menu === "filter" && <div className="vs-workspaceBoardMenu" role="menu" aria-label={t("workspaceBoard.filter")}>
            {(["all", ...LANES] as const).map((value) => <button type="button" role="menuitemradio" aria-checked={laneFilter === value} key={value} onClick={() => { setLaneFilter(value); setMenu(null); }}>{t(value === "all" ? "workspaceBoard.all" : `board.${value}`)}{laneFilter === value && <Check size={13} aria-hidden />}</button>)}
          </div>}
        </div>
        <div className="vs-workspaceBoardActionWrap">
          <button type="button" className={`vs-workspaceBoardAction${menu === "settings" ? " is-active" : ""}`} onClick={() => setMenu((value) => value === "settings" ? null : "settings")} title={t("workspaceBoard.options")} aria-label={t("workspaceBoard.options")} aria-expanded={menu === "settings"}><Settings2 size={15} aria-hidden /></button>
          {menu === "settings" && <div className="vs-workspaceBoardMenu is-settings" role="menu" aria-label={t("workspaceBoard.options")}>
            <button type="button" role="menuitemcheckbox" aria-checked={showPinnedSection} onClick={() => setShowPinnedSection((value) => !value)}>{t("workspaceBoard.showPinned")}<span className={`vs-workspaceBoardCheck${showPinnedSection ? " is-checked" : ""}`}>{showPinnedSection && <Check size={12} aria-hidden />}</span></button>
            <button type="button" role="menuitemcheckbox" aria-checked={showEmptyLanes} onClick={() => setShowEmptyLanes((value) => !value)}>{t("workspaceBoard.showEmpty")}<span className={`vs-workspaceBoardCheck${showEmptyLanes ? " is-checked" : ""}`}>{showEmptyLanes && <Check size={12} aria-hidden />}</span></button>
          </div>}
        </div>
        <button type="button" className="vs-workspaceBoardAction" onClick={() => setView("space")} title={t("workspaceBoard.close")} aria-label={t("workspaceBoard.close")}><X size={16} aria-hidden /></button>
        <button type="button" className="vs-workspaceBoardNew" onClick={() => window.dispatchEvent(new Event("voxiva-new-space"))} title={t("spaces.add")} aria-label={t("spaces.add")}><Plus size={16} aria-hidden /></button>
      </div>
    </header>
    <div className="vs-workspaceBoardBody">
      {showPinnedSection && <div className={`vs-workspaceBoardPinned${pinnedDropActive ? " is-dropTarget" : ""}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setPinnedDropActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPinnedDropActive(false); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setPinnedDropActive(false); const workspace = workspaces.find((item) => item.id === event.dataTransfer.getData("text/plain")); if (workspace && !workspace.pinned) toggleWorkspacePinned(workspace.id); }}>
        <button type="button" aria-expanded={showPinned} onClick={() => setShowPinned((value) => !value)}><Pin size={13} aria-hidden />{t("spaces.pinned")} <span>{visible.filter((ws) => ws.pinned).length}</span></button>
        {showPinned && visible.filter((ws) => ws.pinned).map(card)}
        {showPinned && !visible.some((ws) => ws.pinned) && <span className="vs-workspaceBoardPinHint">{t("workspaceBoard.pinHint")}</span>}
      </div>}
      <div className="vs-workspaceBoardLanes">
        {LANES.map((lane) => {
          const rows = visible.filter((ws) => laneFor(ws) === lane);
          if (laneFilter !== "all" && laneFilter !== lane) return null;
          if (!rows.length && !showEmptyLanes && laneFilter === "all") return null;
          const Icon = lane === "done" ? Check : lane === "review" ? ClipboardList : Circle;
          return <section key={lane} className={`vs-workspaceBoardLane is-${lane}`} aria-label={t(`board.${lane}`)}>
            <h2><Icon size={14} aria-hidden />{t(`board.${lane}`)}<span>{rows.length}</span></h2>
            <div className="vs-workspaceBoardCards">{rows.length ? rows.map(card) : <p>{t("workspaceBoard.empty")}</p>}</div>
          </section>;
        })}
      </div>
    </div>
  </section>;
}
