import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu } from "lucide-react";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { IconRefresh, IconTerminal, IconX } from "@/components/icons";
import { ConfirmDialog } from "@/components/PromptDialog";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { agentIdForSession } from "@/features/agents/sessionAgent";
import { invoke } from "@/platform/desktop";
import { collectSessionIds } from "@/features/workspace/layout";
import { agentBots, isBotReady } from "@/features/agents/bots";
import { loadStatusBarPrefs, subscribeStatusBarPrefs } from "@/features/ui/statusPrefs";

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
  const { sessions, workspaces, t, openBrowserWithUrl, setError, selectWorkspace, removeWorkspace, agentAvailability, agentsScanned } = useSpace();
  const { setView } = useView();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ports, setPorts] = useState<Port[] | null>(null);
  const [portsLoading, setPortsLoading] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [usageMode, setUsageMode] = useState<"detailed" | "compact">("detailed");
  const [selectedUsageAgent, setSelectedUsageAgent] = useState("");
  const [usageDetailTop, setUsageDetailTop] = useState(0);
  const [mode, setMode] = useState<AwakeMode>("off");
  const [awake, setAwake] = useState(false);
  const [awakePending, setAwakePending] = useState(false);
  const [diskUsage, setDiskUsage] = useState<Record<string, DiskUsage | null>>({});
  const [diskLoading, setDiskLoading] = useState(false);
  const diskScanBusy = useRef(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupId, setCleanupId] = useState<string | null>(null);
  const [statusPrefs, setStatusPrefs] = useState(() => loadStatusBarPrefs());
  const confirmedMode = useRef<AwakeMode>("off");
  const portsPanel = useRef<HTMLDivElement>(null);
  const resourcesPanel = useRef<HTMLDivElement>(null);
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

  useEffect(() => subscribeStatusBarPrefs(setStatusPrefs), []);

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
  const detectedAgents = agentsScanned ? agentBots.filter((bot) => bot.id !== "shell" && isBotReady(bot, agentAvailability, true)) : [];
  const usageAgents = detectedAgents.some((bot) => bot.id === "codex") || quotas.length
    ? [agentBots.find((bot) => bot.id === "codex")!, ...detectedAgents.filter((bot) => bot.id !== "codex")]
    : detectedAgents;
  const selectedUsageBot = usageAgents.find((bot) => bot.id === selectedUsageAgent);
  const selectUsageAgent = (id: string, target: HTMLElement) => {
    setSelectedUsageAgent(id);
    const workspace = target.closest(".vs-usageWorkspace");
    if (workspace) setUsageDetailTop(Math.max(0, target.getBoundingClientRect().top - workspace.getBoundingClientRect().top));
  };
  const selectedQuotas = selectedUsageBot?.id === "codex" ? quotas : [];
  const remaining = (at: number) => {
    const minutes = Math.max(0, Math.ceil((at - Date.now()) / 60_000));
    return minutes >= 1440 ? `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };
  const memoryUsedPercent = snapshot?.systemMemoryMb
    ? Math.round(((snapshot.systemMemoryMb - (snapshot.freeSystemMemoryMb ?? 0)) / snapshot.systemMemoryMb) * 100)
    : null;
  const heading = (id: string, title: string) => <header><strong id={`${id}-title`}>{title}</strong><button type="button" popoverTarget={`status-${id}`} popoverTargetAction="hide" aria-label={t("status.close")}><IconX size={14} /></button></header>;
  const quotaWindow = (minutes: number) => minutes >= 10_000 ? "wk" : minutes >= 1_000 ? "day" : `${Math.round(minutes / 60)}h`;
  const overallUsage = quotas.length ? Math.round(quotas.reduce((sum, quota) => sum + quota.used, 0) / quotas.length) : null;

  return <footer className="vs-statusBar" aria-label={t("status.title")}>
    {statusPrefs.usage && <div className="vs-statusUsageModels" aria-label={t("status.usage")}>
      <button type="button" className="vs-statusUsageSummary" popoverTarget="status-usage" aria-expanded={panel === "usage"} title={t("status.usage")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 19V5m0 14h17M8 15l4-4 3 2 5-6" /></svg>
        {overallUsage === null ? <span>{t("status.usage")}</span> : <><i className="vs-statusUsageMiniMeter"><b style={{ width: `${overallUsage}%` }} /></i><strong>{overallUsage}%</strong><small>{remaining(Math.min(...quotas.map((quota) => quota.resetsAt)))}</small></>}
      </button>
      {quotas.map((quota) => <button type="button" className="vs-statusQuotaShortcut" key={quota.minutes} popoverTarget="status-usage" aria-expanded={panel === "usage"} title={`${quotaWindow(quota.minutes)} · ${Math.round(quota.used)}% · ${remaining(quota.resetsAt)}`}>
        <small>{quotaWindow(quota.minutes)}</small><i className="vs-statusUsageMiniMeter"><b style={{ width: `${quota.used}%` }} /></i><strong>{Math.round(quota.used)}%</strong>
      </button>)}
    </div>}
    <div className="vs-statusRight">
      {statusPrefs.awake && <button type="button" popoverTarget="status-awake" aria-expanded={panel === "awake"} title={t("status.awake")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 9h2a3 3 0 0 1 0 6h-2M7 2v3M12 2v3" /></svg><span>{t(`status.${mode}`)}</span><i className={`vs-statusDot${awake ? " is-active" : ""}`} /></button>}
      {statusPrefs.resources && <button type="button" className="vs-statusMemory" popoverTarget="status-resources" aria-expanded={panel === "resources"} title={t("status.resources")}><Cpu size={13} aria-hidden="true" /><span>{snapshot && !failed ? `${snapshot.memoryMb} MB` : "—"}</span></button>}
      {statusPrefs.sessions && <button type="button" onClick={() => setView("space")} title={t("status.sessions")} aria-label={`${t("status.sessions")}: ${live.length}`}><IconTerminal size={13} /><span>{live.length}</span></button>}
      {statusPrefs.agents && <button type="button" className="vs-statusAgents" onClick={() => setView("agents")} title={t("nav.agents")} aria-label={t("nav.agents")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 19v-1a6 6 0 0 1 12 0v1m1-5a4 4 0 0 1 5 4v1" /></svg></button>}
      {statusPrefs.ports && <button type="button" popoverTarget="status-ports" aria-expanded={panel === "ports"} title={t("status.ports")}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 2v6m8-6v6M6 8h12v4a6 6 0 0 1-12 0V8Zm6 10v4" /></svg><span>{t("status.ports")}</span></button>}
    </div>

    <div id="status-awake" className="vs-statusPopup vs-statusAwake" popover="auto" role="dialog" aria-labelledby="awake-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "awake" : prev === "awake" ? null : prev)}>
      {heading("awake", t("status.awake"))}
      <div role="group" aria-label={t("status.awake")} className="vs-statusChoices">{(["on", "agents", "off"] as const).map((value) => <button type="button" key={value} aria-pressed={mode === value} disabled={!desktop || awakePending} onClick={() => setMode(value)}><span className={`vs-statusRadio${mode === value ? " is-selected" : ""}`} /><span><strong>{t(`status.${value}`)}</strong><small>{t(`status.${value}Hint`)}</small></span></button>)}</div>
      <div className="vs-statusPopupFoot">{!desktop ? t("status.desktopOnly") : awake ? t("status.awakeActive") : t("status.awakeInactive")}</div>
    </div>

    <div id="status-usage" className={`vs-statusPopup vs-statusUsage${usageMode === "compact" ? " is-compact" : ""}`} popover="auto" role="dialog" aria-labelledby="usage-title" onToggle={(event) => setPanel((prev) => event.newState === "open" ? "usage" : prev === "usage" ? null : prev)}>
      <header>
        <strong id="usage-title">{t("status.usage")}</strong>
        <span className="vs-statusResourceActions">
          <button type="button" onClick={() => void refresh()} disabled={loading || !desktop} aria-label={t("status.refreshUsage")} title={t("status.refreshUsage")}><IconRefresh size={13} /></button>
          <button type="button" popoverTarget="status-usage" popoverTargetAction="hide" aria-label={t("status.close")}><IconX size={14} /></button>
        </span>
      </header>
      <div className="vs-usageToolbar">
        <span>{agentsScanned ? t("status.usageAllAgents") : t("status.usageScanning")}</span>
        <div role="group" aria-label={t("status.usageView")}>
          {(["detailed", "compact"] as const).map((value) => <button key={value} type="button" aria-pressed={usageMode === value} onClick={() => setUsageMode(value)}>{t(`status.${value}`)}</button>)}
        </div>
      </div>
      <div className="vs-usageWorkspace">
      <div className="vs-usageProviders">
        {usageAgents.map((bot) => {
          const metrics = bot.id === "codex" ? quotas : [];
          return <button type="button" className={`vs-usageProvider${selectedUsageBot?.id === bot.id ? " is-selected" : ""}`} key={bot.id} aria-pressed={selectedUsageBot?.id === bot.id} onMouseEnter={(event) => selectUsageAgent(bot.id, event.currentTarget)} onFocus={(event) => selectUsageAgent(bot.id, event.currentTarget)} onClick={(event) => selectUsageAgent(bot.id, event.currentTarget)}>
            <span className="vs-usageProviderHead"><AgentBrandIcon id={bot.id} size={16} /><strong>{bot.name}</strong>{metrics.length > 0 && <small>{t("status.usageResetsIn")} {remaining(Math.min(...metrics.map((quota) => quota.resetsAt)))}</small>}<span aria-hidden="true">›</span></span>
            {metrics.length ? <span className="vs-usageProviderMeters">{metrics.map((quota) => <span className="vs-usageProviderMeter" key={quota.minutes}>
              <span className="vs-usageRowHead"><strong>{quotaWindow(quota.minutes)}</strong><span>{Math.round(quota.used)}%</span></span>
              <span className="vs-usageMeter" data-level={quota.used >= 90 ? "danger" : quota.used >= 70 ? "warning" : "normal"}><i style={{ width: `${quota.used}%` }} /></span>
            </span>)}</span> : <span className="vs-usageAgentUnknown">{t("status.usageUnavailable")}</span>}
          </button>;
        })}
        {!usageAgents.length && <p className="vs-usageEmpty">{t(agentsScanned ? "status.usageUnavailable" : "status.usageScanning")}</p>}
      </div>
      {selectedUsageBot && <section className="vs-usageDetail" style={{ top: usageDetailTop }} aria-label={selectedUsageBot.name}>
        <header><span><AgentBrandIcon id={selectedUsageBot.id} size={16} /><strong>{selectedUsageBot.name}</strong></span><small>{snapshot?.limits?.at ? `${t("status.usageUpdated")} ${new Date(snapshot.limits.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : t("status.usageUnavailable")}</small></header>
        {selectedQuotas.length ? <div className="vs-usageDetailLimits">{selectedQuotas.map((quota, index) => <div className="vs-usageDetailLimit" key={quota.minutes}>
          <strong>{t(index === 0 ? "status.usageSession" : "status.usageWeekly")}</strong>
          <div className="vs-usageMeter" data-level={quota.used >= 90 ? "danger" : quota.used >= 70 ? "warning" : "normal"}><i style={{ width: `${quota.used}%` }} /></div>
          <div><span>{Math.round(quota.used)}% {t("status.usageUsed")}</span><span>{t("status.usageResetsIn")} {remaining(quota.resetsAt)}</span></div>
        </div>)}</div> : <p className="vs-usageUnavailable">{t(selectedUsageBot.id === "codex" ? "status.usageEmpty" : "status.usageUnavailable")}</p>}
        {selectedUsageBot.id === "codex" && <div className="vs-usageAccount"><strong>{t("status.usageCodexAccount")}</strong><span>{t("status.usageLocalCli")}</span><span aria-hidden="true">›</span></div>}
      </section>}
      </div>
      <button type="button" className="vs-usageDetailsLink" onClick={() => setView("agents")}>{t("status.usageDetailsHistory")} <span aria-hidden="true">›</span></button>
      <button type="button" className="vs-usageDetailsLink" onClick={() => setView("settings")}>{t("status.usageManageAccounts")} <span aria-hidden="true">›</span></button>
      <footer className="vs-usageFoot">{t("status.usageSource")}</footer>
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


