import { useMemo, useState } from "react";
import { useSpace } from "@/features/workspace/SpaceContext";
import { ChevronLeft, ChevronRight, Trash01 } from "@untitledui/icons";

type RangeId = "all" | "today" | "week" | "month" | "day";

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function sameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

function inRange(at: number, range: RangeId, day: number | null) {
  if (range === "all") return true;
  if (range === "day" && day != null) return sameDay(at, day);
  const now = Date.now();
  const today = startOfDay(now);
  if (range === "today") return at >= today;
  if (range === "week") return at >= today - 6 * 24 * 60 * 60 * 1000;
  return at >= today - 29 * 24 * 60 * 60 * 1000;
}

function formatWhen(ts: number, locale: string) {
  try {
    return new Date(ts).toLocaleString(locale.startsWith("ru") ? "ru-RU" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function HistoryPage() {
  const {
    recentHistory,
    workspaces,
    selectWorkspace,
    setView,
    clearHistory,
    removeHistoryItem,
    locale,
    t,
  } = useSpace();
  const [range, setRange] = useState<RangeId>("all");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const activityDays = useMemo(() => {
    const set = new Set<number>();
    for (const item of recentHistory) set.add(startOfDay(item.at));
    return set;
  }, [recentHistory]);

  const rows = useMemo(() => {
    return recentHistory
      .filter((item) => inRange(item.at, range, pickedDay))
      .map((item) => {
        const ws = workspaces.find((w) => w.id === item.workspaceId);
        return { ...item, alive: Boolean(ws) };
      });
  }, [recentHistory, workspaces, range, pickedDay]);

  const ranges: Array<{ id: RangeId; label: string }> = [
    { id: "all", label: t("history.rangeAll") },
    { id: "today", label: t("history.rangeToday") },
    { id: "week", label: t("history.rangeWeek") },
    { id: "month", label: t("history.rangeMonth") },
  ];

  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const totalDays = daysInMonth(cursor.year, cursor.month);
  const blanks = (firstWeekday + 6) % 7;
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleString(
    locale.startsWith("ru") ? "ru-RU" : "en-US",
    { month: "long", year: "numeric" },
  );

  function pickDay(day: number) {
    const ts = startOfDay(new Date(cursor.year, cursor.month, day).getTime());
    setPickedDay(ts);
    setRange("day");
  }

  return (
    <div className="vs-page vs-historyPage">
      <div className="vs-pageHeader">
        <div className="vs-pageHeaderRow">
          <div>
            <h2>{t("history.title")}</h2>
            <p className="vs-pageLead">{t("history.lead")}</p>
          </div>
          {recentHistory.length > 0 && (
            <button
              type="button"
              className="vs-btn vs-btnGhost vs-historyClear"
              onClick={() => {
                if (window.confirm(t("history.clearConfirm"))) clearHistory();
              }}
            >
              <Trash01 size={14} aria-hidden />
              {t("history.clear")}
            </button>
          )}
        </div>
        <div className="vs-historyFilters" role="group" aria-label={t("history.filter")}>
          {ranges.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`vs-historyChip${range === item.id ? " is-active" : ""}`}
              onClick={() => {
                setRange(item.id);
                setPickedDay(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="vs-historyLayout">
        <div className="vs-historyCalendar">
          <div className="vs-historyCalHead">
            <strong>{monthLabel}</strong>
            <div className="vs-historyCalNav">
              <button
                type="button"
                className="vs-iconBtn"
                aria-label="Prev"
                onClick={() =>
                  setCursor((c) => {
                    const d = new Date(c.year, c.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
              >
                <ChevronLeft size={15} aria-hidden />
              </button>
              <button
                type="button"
                className="vs-iconBtn"
                aria-label="Next"
                onClick={() =>
                  setCursor((c) => {
                    const d = new Date(c.year, c.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
              >
                <ChevronRight size={15} aria-hidden />
              </button>
            </div>
          </div>
          <div className="vs-historyCalWeek">
            {(locale.startsWith("ru")
              ? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
              : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
            ).map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="vs-historyCalGrid">
            {Array.from({ length: blanks }).map((_, i) => (
              <span key={`b-${i}`} className="vs-historyCalEmpty" />
            ))}
            {Array.from({ length: totalDays }).map((_, i) => {
              const day = i + 1;
              const ts = startOfDay(new Date(cursor.year, cursor.month, day).getTime());
              const has = activityDays.has(ts);
              const active = pickedDay != null && sameDay(pickedDay, ts);
              const isToday = sameDay(ts, Date.now());
              return (
                <button
                  key={day}
                  type="button"
                  className={`vs-historyCalDay${has ? " is-hot" : ""}${active ? " is-active" : ""}${isToday ? " is-today" : ""}`}
                  onClick={() => pickDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="vs-historyListWrap">
          {rows.length === 0 ? (
            <div className="vs-historyEmptyCard">
              <p>{t("history.empty")}</p>
            </div>
          ) : (
            <div className="vs-historyList">
              {rows.map((item) => (
                <div
                  key={`${item.workspaceId}-${item.at}`}
                  className={`vs-historyItem${item.alive ? "" : " is-gone"}`}
                >
                  <button
                    type="button"
                    className="vs-historyItemMain"
                    disabled={!item.alive}
                    onClick={() => {
                      if (!item.alive) return;
                      selectWorkspace(item.workspaceId);
                      setView("space");
                    }}
                  >
                    <span className="vs-historyWhen">{formatWhen(item.at, locale)}</span>
                    <strong>{item.workspaceName}</strong>
                    <small>{item.cwd}</small>
                    {item.alive ? (
                      <em className="vs-historyOpen">{t("history.open")}</em>
                    ) : (
                      <em>{t("history.gone")}</em>
                    )}
                  </button>
                  <button
                    type="button"
                    className="vs-iconBtn vs-historyItemDelete"
                    title={t("history.removeOne")}
                    aria-label={t("history.removeOne")}
                    onClick={() => removeHistoryItem(item.workspaceId, item.at)}
                  >
                    <Trash01 size={14} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
