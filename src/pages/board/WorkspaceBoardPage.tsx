import { useMemo, useState } from "react";
import { Check, ChevronRight, Circle, ClipboardList, Pin, Plus, Search, X } from "lucide-react";
import { useSpace } from "@/features/workspace/SpaceContext";
import { collectSessionIds } from "@/features/workspace/layout";
import type { Workspace } from "@/lib/types";

type Lane = "todo" | "progress" | "review" | "done";
const LANES: Lane[] = ["todo", "progress", "review", "done"];

export function WorkspaceBoardPage() {
  const { workspaces, sessions, selectWorkspace, toggleWorkspacePinned, t } = useSpace();
  const [query, setQuery] = useState("");
  const [showPinned, setShowPinned] = useState(true);
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
    <div className="vs-workspaceBoardCard" key={ws.id}>
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
      <button type="button" className="vs-workspaceBoardNew" onClick={() => window.dispatchEvent(new Event("voxiva-new-space"))} title={t("spaces.add")} aria-label={t("spaces.add")}><Plus size={16} aria-hidden /></button>
    </header>
    <div className="vs-workspaceBoardBody">
      <div className="vs-workspaceBoardPinned">
        <button type="button" aria-expanded={showPinned} onClick={() => setShowPinned((value) => !value)}><Pin size={13} aria-hidden />{t("spaces.pinned")} <span>{visible.filter((ws) => ws.pinned).length}</span></button>
        {showPinned && visible.filter((ws) => ws.pinned).map(card)}
      </div>
      <div className="vs-workspaceBoardLanes">
        {LANES.map((lane) => {
          const rows = visible.filter((ws) => laneFor(ws) === lane);
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
