import { useState, type CSSProperties } from "react";
import { collectSessionIds } from "@/features/workspace/layout";
import { TERMINAL_OPTIONS } from "@/features/terminal/shells";
import {
  DEFAULT_TERMINAL_PREFS,
  loadTerminalPrefs,
  saveTerminalPrefs,
  type TerminalPrefs,
} from "@/features/terminal/prefs";
import { useSpace } from "@/features/workspace/SpaceContext";

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`vs-toggle${checked ? " is-on" : ""}`} onClick={onChange}><i /></button>;
}

function Choices<T extends string>({ value, options, onChange, className }: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return <div className={`vs-terminalRangeChoices${className ? ` ${className}` : ""}`}>{options.map((option) => (
    <button key={option.value} type="button" className={value === option.value ? "is-active" : ""} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>{option.label}</button>
  ))}</div>;
}

export function TerminalSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, activeWorkspace, sessions, restartSession, closeSession, preferredShell, setPreferredShell, setError } = useSpace();
  const [prefs, setPrefs] = useState<TerminalPrefs>(() => loadTerminalPrefs());
  const [busySession, setBusySession] = useState<string | null>(null);
  const isWindows = navigator.userAgent.includes("Windows");
  const ids = activeWorkspace ? collectSessionIds(activeWorkspace.layout) : [];
  const liveSessions = ids.map((id) => sessions[id]).filter((session) => Boolean(session));
  const patch = (value: Partial<TerminalPrefs>) => setPrefs((current) => {
    const next = { ...current, ...value };
    saveTerminalPrefs(next);
    return next;
  });
  const previewRange = (key: "customContrastRatio" | "scrollSpeed" | "fastScrollSpeed", value: number) => setPrefs((current) => ({ ...current, [key]: value }));
  const commitRange = (key: "customContrastRatio" | "scrollSpeed" | "fastScrollSpeed", value: number) => {
    const next = { ...prefs, [key]: value };
    saveTerminalPrefs(next);
    setPrefs(next);
  };
  const rangeStyle = (value: number, min: number, max: number) => ({ "--vs-range-progress": `${((value - min) / (max - min)) * 100}%` } as CSSProperties);
  const runSessionAction = async (id: string, action: () => Promise<void>) => {
    setBusySession(id);
    try { await action(); } catch (error) { setError(String(error)); } finally { setBusySession(null); }
  };

  return (
    <section className={`vs-settingsPanelBody vs-terminalSettings${embedded ? " is-embedded" : ""}`}>
      <p className="vs-settingsHint">{t("settings.terminalHint")}</p>

      {isWindows ? <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termWindowsShell")}</h3>
        <p className="vs-settingsHint">{t("settings.termWindowsShellHint")}</p>
        <div className="vs-terminalSettingRow">
          <span><strong>{t("settings.termDefaultShell")}</strong><small>{t("settings.termDefaultShellHint")}</small></span>
          <Choices className="is-shellChoices" value={TERMINAL_OPTIONS.some((option) => option.value === preferredShell) ? preferredShell as typeof TERMINAL_OPTIONS[number]["value"] : "powershell.exe"} options={TERMINAL_OPTIONS} onChange={setPreferredShell} />
        </div>
      </div> : null}

      <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termRendering")}</h3>
        <p className="vs-settingsHint">{t("settings.termRenderingHint")}</p>
        <div className="vs-terminalSettingsRows">
          <div className="vs-terminalSettingRow">
            <span><strong>{t("settings.termGpu")}</strong><small>{t("settings.termGpuHint")}</small></span>
            <Choices value={prefs.gpuAcceleration} options={[
              { value: "auto", label: t("settings.termAuto") },
              { value: "on", label: t("settings.termOn") },
              { value: "off", label: t("settings.termOff") },
            ]} onChange={(gpuAcceleration) => patch({ gpuAcceleration })} />
          </div>
          <div className="vs-terminalSettingRow">
            <span><strong>{t("settings.termContrast")}</strong><small>{t("settings.termContrastHint")}</small></span>
            <Choices value={prefs.colorContrast} options={[
              { value: "automatic", label: t("settings.termAutomatic") },
              { value: "off", label: t("settings.termOff") },
              { value: "custom", label: t("settings.termCustom") },
            ]} onChange={(colorContrast) => patch({ colorContrast })} />
          </div>
          {prefs.colorContrast === "custom" ? <label className="vs-terminalSettingField">
            <span>{t("settings.termContrastRatio")}: {prefs.customContrastRatio.toFixed(1)}:1</span>
            <input type="range" min="1" max="7" step="0.5" value={prefs.customContrastRatio} style={rangeStyle(prefs.customContrastRatio, 1, 7)} onChange={(event) => previewRange("customContrastRatio", Number(event.target.value))} onPointerUp={(event) => commitRange("customContrastRatio", Number(event.currentTarget.value))} onKeyUp={(event) => commitRange("customContrastRatio", Number(event.currentTarget.value))} />
          </label> : null}
          <div className="vs-terminalSettingRow">
            <span><strong>{t("settings.termInlineImages")}</strong><small>{t("settings.termInlineImagesHint")}</small></span>
            <Switch checked={prefs.inlineImages} label={t("settings.termInlineImages")} onChange={() => patch({ inlineImages: !prefs.inlineImages })} />
          </div>
        </div>
        <p className="vs-settingsHint">{t("settings.termNewPanesHint")}</p>
      </div>

      <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termInteraction")}</h3>
        <p className="vs-settingsHint">{t("settings.termInteractionHint")}</p>
        <div className="vs-terminalRangeGrid">
          <label className="vs-terminalRangeCard">
            <span>{t("settings.termNormalScroll")}<b>{prefs.scrollSpeed.toFixed(2)}×</b></span>
            <small>{t("settings.termNormalScrollHint")}</small>
            <input type="range" min="0.5" max="3" step="0.05" value={prefs.scrollSpeed} style={rangeStyle(prefs.scrollSpeed, 0.5, 3)} aria-label={t("settings.termNormalScroll")} aria-valuetext={`${prefs.scrollSpeed.toFixed(2)}×`} onChange={(event) => previewRange("scrollSpeed", Number(event.target.value))} onPointerUp={(event) => commitRange("scrollSpeed", Number(event.currentTarget.value))} onKeyUp={(event) => commitRange("scrollSpeed", Number(event.currentTarget.value))} />
            <span className="vs-terminalRangeEnds"><small>0.5×</small><small>3×</small></span>
          </label>
          <label className="vs-terminalRangeCard">
            <span>{t("settings.termFastScroll")}<b>{prefs.fastScrollSpeed.toFixed(1)}×</b></span>
            <small>{t("settings.termFastScrollHint")}</small>
            <input type="range" min="1" max="10" step="0.25" value={prefs.fastScrollSpeed} style={rangeStyle(prefs.fastScrollSpeed, 1, 10)} aria-label={t("settings.termFastScroll")} aria-valuetext={`${prefs.fastScrollSpeed.toFixed(1)}×`} onChange={(event) => previewRange("fastScrollSpeed", Number(event.target.value))} onPointerUp={(event) => commitRange("fastScrollSpeed", Number(event.currentTarget.value))} onKeyUp={(event) => commitRange("fastScrollSpeed", Number(event.currentTarget.value))} />
            <span className="vs-terminalRangeEnds"><small>1×</small><small>10×</small></span>
          </label>
        </div>
        <div className="vs-terminalSettingsRows">
          {([
            ["rightClickPaste", "settings.termRightClick", "settings.termRightClickHint"],
            ["focusFollowsMouse", "settings.termFocusMouse", "settings.termFocusMouseHint"],
            ["copyOnSelect", "settings.termCopySelect", "settings.termCopySelectHint"],
            ["trimGutterOnCopy", "settings.termTrimGutter", "settings.termTrimGutterHint"],
            ["allowOsc52", "settings.termOsc52", "settings.termOsc52Hint"],
          ] as const).map(([key, title, hint]) => (
            <div className="vs-terminalSettingRow" key={key}>
              <span><strong>{t(title)}</strong><small>{t(hint)}</small></span>
              <Switch checked={prefs[key]} label={t(title)} onChange={() => patch({ [key]: !prefs[key] })} />
            </div>
          ))}
        </div>
      </div>

      <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termSetupScript")}</h3>
        <p className="vs-settingsHint">{t("settings.termSetupScriptHint")}</p>
        <label className="vs-terminalSettingField"><span>{t("settings.termSetupCommand")}</span>
          <input value={prefs.setupScriptCommand} placeholder="npm install" onChange={(event) => patch({ setupScriptCommand: event.target.value })} />
        </label>
        <div className="vs-terminalSettingField"><span>{t("settings.termSetupLocation")}</span>
          <div className="vs-terminalRangeChoices">
            {(["tab", "vertical", "horizontal"] as const).map((location) => <button key={location} type="button" className={prefs.setupScriptLocation === location ? "is-active" : ""} aria-pressed={prefs.setupScriptLocation === location} onClick={() => patch({ setupScriptLocation: location })}>{t(location === "tab" ? "settings.termSetupTab" : location === "vertical" ? "settings.termSetupVertical" : "settings.termSetupHorizontal")}</button>)}
          </div>
        </div>
      </div>

      <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termAdvanced")}</h3>
        <p className="vs-settingsHint">{t("settings.termAdvancedHint")}</p>
        <div className="vs-terminalSettingField"><span>{t("settings.termScrollback")}</span>
          <div className="vs-terminalRangeChoices">
            {[5000, 10000, 25000, 50000].map((rows) => <button key={rows} type="button" className={prefs.scrollbackRows === rows ? "is-active" : ""} aria-pressed={prefs.scrollbackRows === rows} onClick={() => patch({ scrollbackRows: rows })}>{rows / 1000}k</button>)}
            <button type="button" className={![5000, 10000, 25000, 50000].includes(prefs.scrollbackRows) ? "is-active" : ""} aria-pressed={![5000, 10000, 25000, 50000].includes(prefs.scrollbackRows)} onClick={() => patch({ scrollbackRows: 12000 })}>{t("settings.termCustom")}</button>
            {![5000, 10000, 25000, 50000].includes(prefs.scrollbackRows) ? <input aria-label={t("settings.termCustomRows")} type="number" min="1000" max="100000" step="1000" value={prefs.scrollbackRows} onChange={(event) => patch({ scrollbackRows: Math.max(1000, Math.min(100000, Number(event.target.value) || 1000)) })} /> : null}
          </div>
        </div>
        <label className="vs-terminalSettingField"><span>{t("settings.termWordSeparators")}</span>
          <input value={prefs.wordSeparators} onChange={(event) => patch({ wordSeparators: event.target.value })} />
        </label>
        <button className="vs-btn vs-btnGhost" type="button" onClick={() => { const next = { ...DEFAULT_TERMINAL_PREFS }; saveTerminalPrefs(next); setPrefs(next); setPreferredShell(""); }}>{t("settings.termReset")}</button>
      </div>

      {!embedded && <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termManageSessions")}</h3>
        <p className="vs-settingsHint">{t("settings.termManageSessionsHint")}</p>
        <div className="vs-terminalSessionList">
          <div className="vs-terminalSessionHead">{t("settings.termSessions")} ({liveSessions.length})</div>
          {liveSessions.map((session) => <div className="vs-terminalSessionRow" key={session.id}>
            <i className={`is-${session.status}`} />
            <span><strong>{session.title}</strong><small title={session.cwd}>{session.cwd}</small></span>
            <button type="button" className="vs-btn vs-btnGhost" disabled={busySession === session.id || session.status !== "online"} onClick={() => void runSessionAction(session.id, () => restartSession(session.id))}>{t("settings.termRestart")}</button>
            <button type="button" className="vs-btn vs-btnGhost" disabled={busySession === session.id} aria-label={`${t("settings.termClose")} ${session.title}`} onClick={() => void runSessionAction(session.id, () => closeSession(session.id))}>{t("settings.termClose")}</button>
          </div>)}
          {!liveSessions.length ? <p className="vs-settingsHint">{t("settings.termNoSessions")}</p> : null}
        </div>
      </div>}
    </section>
  );
}
