import { useCallback, useEffect, useRef, useState } from "react";
import { CpuChip01 } from "@untitledui/icons";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { IconRefresh, IconTerminal, IconX } from "@/components/icons";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { agentIdForSession } from "@/features/agents/sessionAgent";
import { invoke } from "@/platform/desktop";

type Quota = { used: number; minutes: number; resetsAt: number };
type Snapshot = { limits: { at: number; windows: Quota[] } | null; memoryMb: number };
type Port = { port: number; pid: number; host: string };
type AwakeMode = "off" | "on" | "agents";

export function StatusBar() {
  const { sessions, locale, t, openBrowserWithUrl, setError } = useSpace();
  const { setView } = useView();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ports, setPorts] = useState<Port[] | null>(null);
  const [portsLoading, setPortsLoading] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [mode, setMode] = useState<AwakeMode>("off");
  const [awake, setAwake] = useState(false);
  const [awakePending, setAwakePending] = useState(false);
  const confirmedMode = useRef<AwakeMode>("off");
  const portsPanel = useRef<HTMLDivElement>(null);
  const live = Object.values(sessions).filter((session) => session.status === "online");
  const liveAgents = live.filter((session) => agentIdForSession(session) !== "shell");
  const hasAgents = liveAgents.length > 0;
  const desktop = Boolean(window.voxiva);
  const refresh = useCallback(async () => {
    if (!window.voxiva) return;
    setLoading(true);
    try { setSnapshot(await invoke<Snapshot>("status_snapshot")); setFailed(false); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    setAwakePending(true);
    invoke<boolean>("status_awake", { mode, hasAgents }).then((active) => {
      if (!cancelled) { setAwake(active); confirmedMode.current = mode; }
    }).catch((error) => { if (!cancelled) { setMode(confirmedMode.current); setError(String(error)); } }).finally(() => { if (!cancelled) setAwakePending(false); });
    return () => { cancelled = true; };
  }, [desktop, mode, hasAgents, setError]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("voxiva-native-overlay", { detail: { key: "status-panel", active: Boolean(panel) } }));
    return () => { window.dispatchEvent(new CustomEvent("voxiva-native-overlay", { detail: { key: "status-panel", active: false } })); };
  }, [panel]);

  useEffect(() => {
    if (panel !== "ports" || !desktop) return;
    let cancelled = false;
    setPortsLoading(true);
    invoke<Port[] | null>("status_ports").then((result) => { if (!cancelled) setPorts(result); })
      .catch(() => { if (!cancelled) setPorts(null); })
      .finally(() => { if (!cancelled) setPortsLoading(false); });
    return () => { cancelled = true; };
  }, [panel, desktop]);

  const limits = failed ? null : snapshot?.limits;
  const current = limits?.windows.filter((quota) => quota.resetsAt > Date.now()) ?? [];
  const duration = (minutes: number) => minutes >= 1440 ? `${Math.round(minutes / 1440)}${t("status.days")}` : `${Math.round(minutes / 60)}${t("status.hours")}`;
  const remaining = (at: number) => {
    const minutes = Math.max(0, Math.ceil((at - Date.now()) / 60_000));
    return minutes >= 1440 ? `${Math.floor(minutes / 1440)}${t("status.days")} ${Math.floor(minutes % 1440 / 60)}${t("status.hours")}` : `${Math.floor(minutes / 60)}${t("status.hours")} ${minutes % 60}${t("status.minutes")}`;
  };
  const heading = (id: string, title: string) => <header><strong id={`${id}-title`}>{title}</strong><button type="button" popoverTarget={`status-${id}`} popoverTargetAction="hide" aria-label={t("status.close")}><IconX size={14} /></button></header>;

  return <footer className="vs-statusBar" aria-label={t("status.title")}>
    <div className="vs-statusLeft">
      <button type="button" className="vs-statusQuota" popoverTarget="status-limits" aria-expanded={panel === "limits"} title={t("status.limits")}>
        <AgentBrandIcon id="codex" size={14} /><span className="vs-statusProvider">Codex</span>
        {current.length ? current.map((quota) => <span className="vs-statusWindow" key={quota.minutes}>
          <span className="vs-statusMeter" data-level={quota.used >= 90 ? "danger" : quota.used >= 70 ? "warning" : "normal"}><span style={{ width: `${quota.used}%` }} /></span>
          <span>{Math.round(quota.used)}% <span className="vs-statusSecondary">· {remaining(quota.resetsAt)}</span></span>
        </span>) : <span className="vs-statusSecondary">{loading ? "…" : t("status.noData")}</span>}
      </button>
      <span className="vs-statusDivider" />
      <span className="vs-statusCursor" title={t("status.unavailable")}><AgentBrandIcon id="cursor-agent" size={13} /><span>Cursor</span><span className="vs-statusSecondary">—</span></span>
      <button type="button" className="vs-statusRefresh" onClick={() => void refresh()} disabled={loading || !desktop} aria-label={t("status.refresh")} title={t("status.refresh")}><IconRefresh size={12} /></button>
    </div>
    <div className="vs-statusRight">
      <button type="button" popoverTarget="status-awake" aria-expanded={panel === "awake"} title={t("status.awake")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3" /></svg><span>{t(`status.${mode}`)}</span><i className={`vs-statusDot${awake ? " is-active" : ""}`} /></button>
      <span className="vs-statusMemory" title={t("status.memory")}><CpuChip01 size={13} aria-hidden="true" />{snapshot && !failed ? `${snapshot.memoryMb} MB` : "—"}</span>
      <button type="button" onClick={() => setView("space")} title={t("status.sessions")} aria-label={`${t("status.sessions")}: ${live.length}`}><IconTerminal size={13} />{live.length}</button>
      <button type="button" className="vs-statusAgents" onClick={() => setView("agents")} title={t("status.runningAgents")} aria-label={`${t("status.runningAgents")}: ${liveAgents.length}`}><AgentBrandIcon id={liveAgents[0] ? agentIdForSession(liveAgents[0]) : "codex"} size={13} /><span>{liveAgents.length}</span></button>
      <button type="button" popoverTarget="status-ports" aria-expanded={panel === "ports"} title={t("status.ports")}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 2v6m8-6v6M6 8h12v4a6 6 0 0 1-12 0V8Zm6 10v4" /></svg><span>{t("status.ports")}</span></button>
    </div>

    <div id="status-limits" className="vs-statusPopup vs-statusLimits" popover="auto" role="dialog" aria-labelledby="limits-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "limits" : prev === "limits" ? null : prev)}>
      {heading("limits", t("status.limits"))}
      <section><div className="vs-statusSectionTitle"><AgentBrandIcon id="codex" size={18} /><strong>Codex</strong><span>{t("status.used")}</span></div>
        {current.length ? current.map((quota) => <div className="vs-quotaDetail" key={quota.minutes}>
          <div><span>{duration(quota.minutes)}</span><strong>{Math.round(quota.used)}%</strong></div>
          <meter min={0} max={100} value={quota.used} low={70} high={90} optimum={0} aria-label={`Codex ${duration(quota.minutes)}`} />
          <small>{t("status.resets")} {remaining(quota.resetsAt)} · {new Date(quota.resetsAt).toLocaleString(locale)}</small>
        </div>) : <p>{loading ? t("status.loading") : t("status.codexEmpty")}</p>}
        {limits && <p className="vs-statusTimestamp">{t("status.updated")} {new Date(limits.at).toLocaleString(locale)}</p>}
      </section>
      <section><div className="vs-statusSectionTitle"><AgentBrandIcon id="cursor-agent" size={17} /><strong>Cursor</strong><span>—</span></div><p>{t("status.unavailable")}</p></section>
      <div className="vs-statusPopupFoot">{!desktop ? t("status.desktopOnly") : failed ? t("status.failed") : t("status.source")}</div>
    </div>

    <div id="status-awake" className="vs-statusPopup vs-statusAwake" popover="auto" role="dialog" aria-labelledby="awake-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "awake" : prev === "awake" ? null : prev)}>
      {heading("awake", t("status.awake"))}
      <div role="group" aria-label={t("status.awake")} className="vs-statusChoices">{(["on", "agents", "off"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} disabled={!desktop || awakePending} onClick={() => setMode(value)}><span className={`vs-statusRadio${mode === value ? " is-selected" : ""}`} /><span><strong>{t(`status.${value}`)}</strong><small>{t(`status.${value}Hint`)}</small></span></button>)}</div>
      <div className="vs-statusPopupFoot">{!desktop ? t("status.desktopOnly") : awake ? t("status.awakeActive") : t("status.awakeInactive")}</div>
    </div>

    <div ref={portsPanel} id="status-ports" className="vs-statusPopup vs-statusPorts" popover="auto" role="dialog" aria-labelledby="ports-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "ports" : prev === "ports" ? null : prev)}>
      {heading("ports", t("status.ports"))}
      <div className="vs-statusPopupFoot">{t("status.localPorts")}{ports && !portsLoading ? ` · ${ports.length}` : ""}</div>
      <div className="vs-statusPortList">{portsLoading ? <p>{t("status.loading")}</p> : ports === null ? <p>{t(desktop ? "status.portsUnavailable" : "status.desktopOnly")}</p> : ports.length === 0 ? <p>{t("status.noPorts")}</p> : ports.map(({ port, pid, host }) => <button type="button" key={`${port}:${pid}`} title={`${t("status.openPort")} http://${host}:${port}`} onClick={() => { portsPanel.current?.hidePopover(); void openBrowserWithUrl(`http://${host}:${port}`).catch((error) => setError(String(error))); }}><strong>{port}</strong><span><span>PID {pid}</span><small>{host}:{port}</small></span><span aria-hidden="true">↗</span></button>)}</div>
    </div>
  </footer>;
}
