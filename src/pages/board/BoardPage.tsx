import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Calendar, ChevronLeft, ChevronRight, CodeBrowser, Plus, Trash01 } from "@untitledui/icons";
import { IconX } from "@/components/icons";
import { DatePicker } from "@/components/DatePicker";
import { PrioritySelect } from "@/components/PrioritySelect";
import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import { createTerminalSession, killTerminalSession, writeTerminalSession } from "@/features/terminal/api";
import { useSpace } from "@/features/workspace/SpaceContext";
import { clientError } from "@/lib/errors";
import type { TerminalSession } from "@/lib/types";
import {
  BOARD_COLUMNS,
  createTask,
  loadBoard,
  saveBoard,
  type BoardColumn,
  type TaskPriority,
  type WorkspaceTask,
} from "@/features/board/store";

const ASSIST_W_KEY = "voxiva-space-board-assist-w";
const MIN_ASSIST_W = 280;
const MAX_ASSIST_W = 720;
const DEFAULT_ASSIST_W = 420;

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function formatDayLabel(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale.startsWith("ru") ? "ru-RU" : "en-US", {
    weekday: "short",
    day: "numeric",
  });
}

function formatMonthTitle(year: number, month: number, locale: string) {
  return new Date(year, month, 1).toLocaleDateString(locale.startsWith("ru") ? "ru-RU" : "en-US", {
    month: "long",
    year: "numeric",
  });
}

function toIsoDate(ts: number) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function openNewSpace() {
  window.dispatchEvent(new CustomEvent("voxiva-new-space"));
}

export function BoardPage() {
  const { activeWorkspace, setError, locale, t } = useSpace();
  const wsId = activeWorkspace?.id ?? "";
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [draft, setDraft] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [due, setDue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [calMode, setCalMode] = useState<"week" | "month">("week");
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [filterDay, setFilterDay] = useState<string | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistSession, setAssistSession] = useState<TerminalSession | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistW, setAssistW] = useState(() => {
    try {
      const n = Number(localStorage.getItem(ASSIST_W_KEY));
      if (Number.isFinite(n) && n >= MIN_ASSIST_W && n <= MAX_ASSIST_W) return n;
    } catch {
      // ignore
    }
    return DEFAULT_ASSIST_W;
  });
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    setTasks(wsId ? loadBoard(wsId) : []);
  }, [wsId]);

  useEffect(() => {
    const onRemote = (event: Event) => {
      const id = (event as CustomEvent<{ workspaceId?: string }>).detail?.workspaceId;
      if (!wsId || (id && id !== wsId)) return;
      setTasks(loadBoard(wsId));
    };
    window.addEventListener("voxiva-board-updated", onRemote);
    return () => window.removeEventListener("voxiva-board-updated", onRemote);
  }, [wsId]);

  useEffect(() => {
    try {
      localStorage.setItem(ASSIST_W_KEY, String(assistW));
    } catch {
      // ignore
    }
  }, [assistW]);

  useEffect(() => {
    return () => {
      if (assistSession) {
        void killTerminalSession(assistSession.id).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup only on unmount
  }, []);

  const weekDays = useMemo(() => {
    const base = startOfDay(Date.now()) + weekOffset * 7 * 24 * 60 * 60 * 1000;
    const mondayOffset = (new Date(base).getDay() + 6) % 7;
    const monday = base - mondayOffset * 24 * 60 * 60 * 1000;
    return Array.from({ length: 7 }, (_, i) => monday + i * 24 * 60 * 60 * 1000);
  }, [weekOffset]);

  const monthDays = useMemo(() => {
    const first = new Date(monthCursor.year, monthCursor.month, 1);
    const startPad = (first.getDay() + 6) % 7;
    const start = startOfDay(first.getTime()) - startPad * 24 * 60 * 60 * 1000;
    return Array.from({ length: 42 }, (_, i) => start + i * 24 * 60 * 60 * 1000);
  }, [monthCursor]);

  const dueCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const task of tasks) {
      if (!task.due) continue;
      map.set(task.due, (map.get(task.due) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    if (!filterDay) return tasks;
    return tasks.filter((task) => task.due === filterDay);
  }, [tasks, filterDay]);

  function persist(next: WorkspaceTask[]) {
    setTasks(next);
    if (wsId) saveBoard(wsId, next);
  }

  function addTask() {
    const title = draft.trim();
    if (!title || !wsId) return;
    persist([createTask(title, priority, due || filterDay || null), ...tasks]);
    setDraft("");
    setDue("");
  }

  function moveTask(id: string, column: BoardColumn) {
    persist(tasks.map((task) => (task.id === id ? { ...task, column } : task)));
  }

  function removeTask(id: string) {
    persist(tasks.filter((task) => task.id !== id));
  }

  async function ensureAssistSession() {
    if (assistSession) return assistSession;
    if (!activeWorkspace) return null;
    setAssistBusy(true);
    try {
      const created = await createTerminalSession({
        cwd: activeWorkspace.cwd || null,
        title: "Board Assist",
        cols: 100,
        rows: 28,
        initialCommand: "opencode",
        shell: null,
      });
      const session: TerminalSession = {
        id: created.id,
        title: created.title || "OpenCode",
        cwd: created.cwd || activeWorkspace.cwd,
        shell: created.shell || "shell",
        status: "online",
        accent: "blue",
        needsAttention: false,
      };
      setAssistSession(session);
      return session;
    } catch (err) {
      setError(clientError(err));
      return null;
    } finally {
      setAssistBusy(false);
    }
  }

  async function openAssist() {
    setAssistOpen(true);
    await ensureAssistSession();
  }

  async function closeAssist() {
    setAssistOpen(false);
    if (assistSession) {
      const id = assistSession.id;
      setAssistSession(null);
      await killTerminalSession(id).catch(() => undefined);
    }
  }

  async function askOpenCode() {
    const session = (await ensureAssistSession()) ?? assistSession;
    if (!session || !activeWorkspace) return;
    setAssistOpen(true);
    const prompt = [
      `Plan concrete tasks for project "${activeWorkspace.name}" at ${activeWorkspace.cwd}.`,
      "List 5-8 realistic engineering tasks with priorities and suggested due dates.",
      "Keep the answer short and actionable — no JSON dumps.",
    ].join(" ");
    try {
      await writeTerminalSession(session.id, `${prompt}\r`);
    } catch (err) {
      setError(clientError(err));
    }
  }

  function onAssistResizeDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: assistW };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onAssistResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startX - e.clientX;
    const next = Math.min(MAX_ASSIST_W, Math.max(MIN_ASSIST_W, dragRef.current.startW + delta));
    setAssistW(next);
  }

  function onAssistResizeUp() {
    dragRef.current = null;
  }

  if (!activeWorkspace) {
    return (
      <div className="vs-empty">
        <h2>{t("board.emptyWs")}</h2>
        <button type="button" className="vs-btn vs-btnPrimary" onClick={openNewSpace}>
          {t("spaces.add")}
        </button>
      </div>
    );
  }

  return (
    <div className={`vs-page vs-boardPage${assistOpen ? " has-assist" : ""}`}>
      <div className="vs-boardMain">
        <div className="vs-pageHeader">
          <div className="vs-pageHeaderRow">
            <div>
              <h2 className="vs-boardHeading">
                <Calendar size={20} aria-hidden />
                {t("board.title")}
              </h2>
              <p className="vs-pageLead">{t("board.lead")}</p>
            </div>
            <div className="vs-boardHeaderActions">
              <div className="vs-boardModeTabs" role="tablist">
                <button
                  type="button"
                  className={calMode === "week" ? "is-active" : ""}
                  onClick={() => setCalMode("week")}
                >
                  {t("board.week")}
                </button>
                <button
                  type="button"
                  className={calMode === "month" ? "is-active" : ""}
                  onClick={() => setCalMode("month")}
                >
                  {t("board.month")}
                </button>
              </div>
              <button
                type="button"
                className={`vs-btn${assistOpen ? " vs-btnPrimary" : ""}`}
                onClick={() => void (assistOpen ? closeAssist() : openAssist())}
                disabled={assistBusy}
              >
                <CodeBrowser size={15} aria-hidden />
                {t("board.assist")}
              </button>
            </div>
          </div>

          {calMode === "week" ? (
            <div className="vs-boardWeek" aria-label={t("board.week")}>
              <button
                type="button"
                className="vs-iconBtn"
                title={t("board.prevWeek")}
                aria-label={t("board.prevWeek")}
                onClick={() => setWeekOffset((v) => v - 1)}
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
              <div className="vs-boardWeekDays">
                {weekDays.map((dayTs) => {
                  const iso = toIsoDate(dayTs);
                  const count = dueCounts.get(iso) ?? 0;
                  const isToday = iso === toIsoDate(Date.now());
                  const active = filterDay === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`vs-boardDay${active ? " is-active" : ""}${isToday ? " is-today" : ""}`}
                      onClick={() => setFilterDay(active ? null : iso)}
                    >
                      <span>{formatDayLabel(dayTs, locale)}</span>
                      <em>{count}</em>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="vs-iconBtn"
                title={t("board.nextWeek")}
                aria-label={t("board.nextWeek")}
                onClick={() => setWeekOffset((v) => v + 1)}
              >
                <ChevronRight size={16} aria-hidden />
              </button>
            </div>
          ) : (
            <div className="vs-boardMonth" aria-label={t("board.month")}>
              <div className="vs-boardMonthNav">
                <button
                  type="button"
                  className="vs-iconBtn"
                  title={t("board.prevMonth")}
                  aria-label={t("board.prevMonth")}
                  onClick={() =>
                    setMonthCursor((c) => {
                      const d = new Date(c.year, c.month - 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })
                  }
                >
                  <ChevronLeft size={16} aria-hidden />
                </button>
                <strong>{formatMonthTitle(monthCursor.year, monthCursor.month, locale)}</strong>
                <button
                  type="button"
                  className="vs-iconBtn"
                  title={t("board.nextMonth")}
                  aria-label={t("board.nextMonth")}
                  onClick={() =>
                    setMonthCursor((c) => {
                      const d = new Date(c.year, c.month + 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    })
                  }
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
              </div>
              <div className="vs-boardMonthGrid">
                {monthDays.map((dayTs) => {
                  const iso = toIsoDate(dayTs);
                  const d = new Date(dayTs);
                  const inMonth = d.getMonth() === monthCursor.month;
                  const count = dueCounts.get(iso) ?? 0;
                  const isToday = iso === toIsoDate(Date.now());
                  const active = filterDay === iso;
                  return (
                    <button
                      key={iso}
                      type="button"
                      className={`vs-boardMonthDay${!inMonth ? " is-out" : ""}${active ? " is-active" : ""}${isToday ? " is-today" : ""}`}
                      onClick={() => setFilterDay(active ? null : iso)}
                    >
                      <span>{d.getDate()}</span>
                      {count > 0 ? <em>{count}</em> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="vs-boardComposer">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask();
              }}
              placeholder={t("board.prompt")}
              aria-label={t("board.prompt")}
            />
            <PrioritySelect value={priority} onChange={setPriority} />
            <DatePicker value={due || filterDay || ""} onChange={setDue} label={t("board.due")} />
            <button type="button" className="vs-btn vs-btnPrimary" onClick={addTask}>
              <Plus size={15} aria-hidden />
              {t("board.add")}
            </button>
          </div>
        </div>

        <div className="vs-boardColumns">
          {BOARD_COLUMNS.map((col) => {
            const items = visibleTasks.filter((task) => task.column === col);
            return (
              <section
                key={col}
                className={`vs-boardCol is-${col}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) moveTask(dragId, col);
                  setDragId(null);
                }}
              >
                <header>
                  <strong>
                    {t(
                      col === "todo"
                        ? "board.todo"
                        : col === "progress"
                          ? "board.progress"
                          : col === "review"
                            ? "board.review"
                            : col === "done"
                              ? "board.done"
                              : "board.cancelled",
                    )}
                  </strong>
                  <em>{items.length}</em>
                </header>
                <div className="vs-boardCards">
                  {items.length === 0 ? (
                    <p className="vs-boardEmpty">{t("board.emptyCol")}</p>
                  ) : (
                    items.map((task) => (
                      <article
                        key={task.id}
                        className={`vs-boardCard is-${task.priority}`}
                        draggable
                        onDragStart={() => setDragId(task.id)}
                        onDragEnd={() => setDragId(null)}
                      >
                        <div className="vs-boardCardTop">
                          <span className={`vs-boardPri is-${task.priority}`}>
                            {t(
                              task.priority === "low"
                                ? "board.pLow"
                                : task.priority === "medium"
                                  ? "board.pMed"
                                  : task.priority === "high"
                                    ? "board.pHigh"
                                    : "board.pCrit",
                            )}
                          </span>
                          <button
                            type="button"
                            className="vs-iconBtn"
                            title={t("board.delete")}
                            aria-label={t("board.delete")}
                            onClick={() => removeTask(task.id)}
                          >
                            <Trash01 size={14} aria-hidden />
                          </button>
                        </div>
                        <strong>{task.title}</strong>
                        {task.due ? (
                          <small>
                            {(() => {
                              const [y, m, d] = task.due.split("-");
                              return y && m && d ? `${d}.${m}.${y}` : task.due;
                            })()}
                          </small>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {assistOpen && (
        <aside className="vs-boardAssist" style={{ width: assistW }} aria-label={t("board.assist")}>
          <div
            className="vs-boardAssistResize"
            onPointerDown={onAssistResizeDown}
            onPointerMove={onAssistResizeMove}
            onPointerUp={onAssistResizeUp}
            onPointerCancel={onAssistResizeUp}
          />
          <header className="vs-boardAssistHead">
            <div>
              <strong>{t("board.assist")}</strong>
              <small>{t("board.assistHint")}</small>
            </div>
            <div className="vs-boardAssistActions">
              <button type="button" className="vs-btn" disabled={assistBusy} onClick={() => void askOpenCode()}>
                {t("board.ask")}
              </button>
              <button type="button" className="vs-iconBtn" title={t("assist.close")} onClick={() => void closeAssist()}>
                <IconX size={15} />
              </button>
            </div>
          </header>
          <div className="vs-boardAssistTerm">
            {assistSession ? (
              <TerminalPane
                isActive
                session={assistSession}
                paneId="board-assist"
                onClose={() => void closeAssist()}
                onRestart={() => {
                  void (async () => {
                    await closeAssist();
                    await openAssist();
                  })();
                }}
                onFocus={() => undefined}
              />
            ) : (
              <div className="vs-boardAssistEmpty">{assistBusy ? "…" : t("board.assistEmpty")}</div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
