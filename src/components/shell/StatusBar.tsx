import { useCallback, useEffect, useRef, useState } from "react";
import { CpuChip01 } from "@untitledui/icons";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { IconRefresh, IconTerminal, IconX } from "@/components/icons";
import { ConfirmDialog } from "@/components/PromptDialog";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { agentIdForSession } from "@/features/agents/sessionAgent";
import { invoke } from "@/platform/desktop";
import { collectSessionIds } from "@/features/workspace/layout";

type Quota = { used: number; minutes: number; resetsAt: number };
type Snapshot = {
  limits: { at: number; windows: Quota[] } | null;
  memoryMb: number;
  processes?: Array<{ pid: number; name: string; cpu: number; memoryMb: number }>;
  systemMemoryMb?: number;
  freeSystemMemoryMb?: number;
};
type Port = { port: number; pid: number; host: string };
type AwakeMode = "off" | "on" | "agents";
type DiskUsage = { path: string; bytes: number; scannedEntries: number; complete: boolean };

const formatBytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;

export function StatusBar() {
  const { sessions, workspaces, activeWorkspace, locale, t, openBrowserWithUrl, setError, selectWorkspace, removeWorkspace } = useSpace();
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
  const [diskUsage, setDiskUsage] = useState<Record<string, DiskUsage | null>>({});
  const [diskLoading, setDiskLoading] = useState(false);
  const diskScanBusy = useRef(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupId, setCleanupId] = useState<string | null>(null);
  const confirmedMode = useRef<AwakeMode>("off");
  const portsPanel = useRef<HTMLDivElement>(null);
  const resourcesPanel = useRef<HTMLDivElement>(null);
  const live = Object.values(sessions).filter((session) => session.status === "online");
  const liveAgents = live.filter((session) => agentIdForSession(session) !== "shell");
  const sessionTabs = workspaces.flatMap((workspace) => collectSessionIds(workspace.layout)
    .map((id) => sessions[id]).filter((session) => session !== undefined)
    .map((session) => ({ ...session, workspace })));
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

  useEffect(() => {
    if (panel === "resources") void refresh();
  }, [panel, refresh]);

  const scanDisk = useCallback(async () => {
    if (!desktop || diskScanBusy.current) return;
    diskScanBusy.current = true;
    setDiskLoading(true);
    const results: Record<string, DiskUsage | null> = {};
    try {
      for (const workspace of workspaces) {
        try { results[workspace.id] = await invoke<DiskUsage>("workspace_disk_usage", { path: workspace.cwd }); }
        catch { results[workspace.id] = null; }
      }
      setDiskUsage(results);
    } finally { diskScanBusy.current = false; setDiskLoading(false); }
  }, [desktop, workspaces]);

  useEffect(() => {
    if (panel === "resources" && Object.keys(diskUsage).length === 0) void scanDisk();
  }, [panel, diskUsage, scanDisk]);

  const cleanupCandidates = workspaces.map((workspace) => ({ workspace, sessions: collectSessionIds(workspace.layout).map((id) => sessions[id]).filter((session) => session !== undefined) })).filter(({ sessions: rows }) => rows.every((session) => session.status !== "online"));
  const cleanupTarget = workspaces.find((workspace) => workspace.id === cleanupId);

  const quotas = snapshot?.limits?.windows.filter((quota) => quota.resetsAt > Date.now()) ?? [];
  const remaining = (at: number) => {
    const minutes = Math.max(0, Math.ceil((at - Date.now()) / 60_000));
    return minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };
  const memoryUsedPercent = snapshot?.systemMemoryMb
    ? Math.round(((snapshot.systemMemoryMb - (snapshot.freeSystemMemoryMb ?? 0)) / snapshot.systemMemoryMb) * 100)
    : null;
  const heading = (id: string, title: string) => <header><strong id={`${id}-title`}>{title}</strong><button type="button" popoverTarget={`status-${id}`} popoverTargetAction="hide" aria-label={t("status.close")}><IconX size={14} /></button></header>;

  return <footer className="vs-statusBar" aria-label={t("status.title")}>
    <div className="vs-statusQuotaGroup" aria-label="Codex">
      <AgentBrandIcon id="codex" size={13} />
      {quotas.length ? quotas.map((quota) => <span className="vs-statusQuota" key={quota.minutes} title={`${quota.minutes} min · ${new Date(quota.resetsAt).toLocaleString(locale)}`}>
        <span className="vs-statusQuotaMeter" data-level={quota.used >= 90 ? "danger" : quota.used >= 70 ? "warning" : "normal"}><span style={{ width: `${quota.used}%` }} /></span>
        <span>{Math.round(quota.used)}%</span><small>{remaining(quota.resetsAt)}</small>
      </span>) : <span className="vs-statusQuotaEmpty" title={t("status.codexEmpty")}>—</span>}
    </div>
    <nav className="vs-statusSessions" aria-label={t("status.sessions")}>
      {sessionTabs.map((session) => <button type="button" key={session.id} className={session.workspace.id === activeWorkspace?.id ? "is-active" : ""} title={`${session.title} · ${session.workspace.name} · ${session.cwd}`} onClick={() => { resourcesPanel.current?.hidePopover(); selectWorkspace(session.workspace.id); }}>
        <i className={`vs-statusDot${session.status === "online" ? " is-active" : ""}`} />
        <span>{session.title}</span>
      </button>)}
    </nav>
    <div className="vs-statusRight">
      <button type="button" popoverTarget="status-awake" aria-expanded={panel === "awake"} title={t("status.awake")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3" /></svg><span>{t(`status.${mode}`)}</span><i className={`vs-statusDot${awake ? " is-active" : ""}`} /></button>
      <button type="button" className="vs-statusMemory" popoverTarget="status-resources" aria-expanded={panel === "resources"} title={t("status.resources")}><CpuChip01 size={13} aria-hidden="true" /><span>{snapshot && !failed ? `${snapshot.memoryMb} MB` : "—"}</span></button>
      <button type="button" onClick={() => setView("space")} title={t("status.sessions")} aria-label={`${t("status.sessions")}: ${live.length}`}><IconTerminal size={13} /><span>{live.length}</span></button>
      <button type="button" className="vs-statusAgents" onClick={() => setView("agents")} title={t("status.runningAgents")} aria-label={`${t("status.runningAgents")}: ${liveAgents.length}`}><AgentBrandIcon id={liveAgents[0] ? agentIdForSession(liveAgents[0]) : "codex"} size={13} /><span>{liveAgents.length}</span></button>
      <button type="button" popoverTarget="status-ports" aria-expanded={panel === "ports"} title={t("status.ports")}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 2v6m8-6v6M6 8h12v4a6 6 0 0 1-12 0V8Zm6 10v4" /></svg><span>{t("status.ports")}</span></button>
    </div>

    <div id="status-awake" className="vs-statusPopup vs-statusAwake" popover="auto" role="dialog" aria-labelledby="awake-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "awake" : prev === "awake" ? null : prev)}>
      {heading("awake", t("status.awake"))}
      <div role="group" aria-label={t("status.awake")} className="vs-statusChoices">{(["on", "agents", "off"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} disabled={!desktop || awakePending} onClick={() => setMode(value)}><span className={`vs-statusRadio${mode === value ? " is-selected" : ""}`} /><span><strong>{t(`status.${value}`)}</strong><small>{t(`status.${value}Hint`)}</small></span></button>)}</div>
      <div className="vs-statusPopupFoot">{!desktop ? t("status.desktopOnly") : awake ? t("status.awakeActive") : t("status.awakeInactive")}</div>
    </div>

    <div ref={resourcesPanel} id="status-resources" className="vs-statusPopup vs-statusResources" popover="auto" role="dialog" aria-labelledby="resources-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "resources" : prev === "resources" ? null : prev)}>
      <header>
        <strong id="resources-title">{t("status.resources")}</strong>
        <span className="vs-statusResourceActions">
          <button type="button" onClick={() => void refresh()} disabled={loading || !desktop} aria-label={t("status.refreshResources")} title={t("status.refreshResources")}><IconRefresh size={13} /></button>
          <button type="button" popoverTarget="status-resources" popoverTargetAction="hide" aria-label={t("status.close")}><IconX size={14} /></button>
        </span>
      </header>
      <div className="vs-statusResourceSummary">
        <strong>{memoryUsedPercent === null ? "—" : `${memoryUsedPercent}%`}</strong><span>{t("status.systemMemory")}</span><i>·</i>
        <strong>{snapshot && !failed ? `${snapshot.memoryMb} MB` : "—"}</strong><span>{t("status.app")}</span><i>·</i>
        <strong>{workspaces.length && workspaces.every((workspace) => diskUsage[workspace.id]) ? formatBytes(workspaces.reduce((sum, workspace) => sum + (diskUsage[workspace.id]?.bytes ?? 0), 0)) : "—"}</strong><span>{t("status.disk")}</span>
      </div>
      <div className="vs-statusResourceColumns"><span>{t("status.process")}</span><span>CPU</span><span>WS</span></div>
      <div className="vs-statusResourceList">
        {failed || !snapshot?.processes ? <p>{t("status.resourcesUnavailable")}</p> : snapshot.processes.map((process) => (
          <div className="vs-statusResourceRow" key={process.pid}>
            <span><i className="vs-statusDot is-active" />{process.name}</span><span>{process.cpu.toFixed(1)}%</span><span>{process.memoryMb} MB</span>
          </div>
        ))}
      </div>
      {workspaces.length ? <section className="vs-statusWorkspaceList">
        <strong>{t("status.workspaces")}</strong>
        {workspaces.map((workspace) => {
          const rows = collectSessionIds(workspace.layout).map((id) => sessions[id]).filter((session) => session !== undefined);
          const disk = diskUsage[workspace.id];
          return <details key={workspace.id}>
            <summary><span>{workspace.name}</span><small>{diskLoading && !disk ? t("status.scanning") : disk ? `${formatBytes(disk.bytes)}${disk.complete ? "" : " +"}` : t("status.scanFailed")}</small></summary>
            {rows.map((session) => <button type="button" key={session.id} onClick={() => { resourcesPanel.current?.hidePopover(); selectWorkspace(workspace.id); }}>
              <i className={`vs-statusDot${session.status === "online" ? " is-active" : ""}`} />{session.title}<small>{session.status}</small>
            </button>)}
            <div className="vs-statusWorkspaceMeta"><span>{t("status.terminalCount").replace("{n}", String(rows.length))}</span><span>{workspace.cwd}</span></div>
          </details>
        })}
      </section> : <p className="vs-statusEmpty">{t("status.noWorkspaces")}</p>}
      {cleanupCandidates.length > 0 && <button type="button" className="vs-statusCleanup" onClick={() => { setCleanupId(null); setCleanupOpen(true); }}>{t("status.cleanup")} <span>{cleanupCandidates.length} ›</span></button>}
      <footer className="vs-statusResourceFooter"><span>{t("status.diskNote")}</span><button type="button" onClick={() => void refresh()} disabled={loading || !desktop} aria-label={t("status.refreshResources")}><IconRefresh size={12} /></button></footer>
    </div>

    <div ref={portsPanel} id="status-ports" className="vs-statusPopup vs-statusPorts" popover="auto" role="dialog" aria-labelledby="ports-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "ports" : prev === "ports" ? null : prev)}>
      {heading("ports", t("status.ports"))}
      <div className="vs-statusPopupFoot">{t("status.localPorts")}{ports && !portsLoading ? ` · ${ports.length}` : ""}</div>
      <div className="vs-statusPortList">{portsLoading ? <p>{t("status.loading")}</p> : ports === null ? <p>{t(desktop ? "status.portsUnavailable" : "status.desktopOnly")}</p> : ports.length === 0 ? <p>{t("status.noPorts")}</p> : ports.map(({ port, pid, host }) => <button type="button" key={`${port}:${pid}`} title={`${t("status.openPort")} http://${host}:${port}`} onClick={() => { portsPanel.current?.hidePopover(); void openBrowserWithUrl(`http://${host}:${port}`).catch((error) => setError(String(error))); }}><strong>{port}</strong><span><span>PID {pid}</span><small>{host}:{port}</small></span><span aria-hidden="true">↗</span></button>)}</div>
    </div>
    <ConfirmDialog open={cleanupOpen && Boolean(cleanupTarget)} danger title={t("status.cleanupTitle")} body={t("status.cleanupConfirm").replace("{name}", cleanupTarget?.name ?? "")} confirmLabel={t("status.cleanupAction")} cancelLabel={t("projects.cancel")} onCancel={() => { setCleanupOpen(false); setCleanupId(null); }} onConfirm={() => { if (cleanupId && cleanupCandidates.some(({ workspace }) => workspace.id === cleanupId)) void removeWorkspace(cleanupId).then(() => setDiskUsage((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== cleanupId)))); setCleanupOpen(false); setCleanupId(null); }} />
    {cleanupOpen && !cleanupId && <div className="vs-modalScrim vs-promptScrim" role="presentation" onClick={() => setCleanupOpen(false)}><div className="vs-modal vs-promptModal" role="dialog" aria-modal="true" aria-label={t("status.cleanupTitle")} onClick={(event) => event.stopPropagation()}><div className="vs-modalHeader"><strong>{t("status.cleanupTitle")}</strong></div><p className="vs-modalLead">{t("status.cleanupHint")}</p><div className="vs-statusCleanupList">{cleanupCandidates.map(({ workspace }) => <button key={workspace.id} type="button" onClick={() => setCleanupId(workspace.id)}><span>{workspace.name}</span><small>{workspace.cwd}</small><strong>{t("status.cleanupReview")}</strong></button>)}</div><div className="vs-modalActions"><button type="button" className="vs-btn vs-btnGhost" onClick={() => setCleanupOpen(false)}>{t("projects.cancel")}</button></div></div></div>}
  </footer>;
}
