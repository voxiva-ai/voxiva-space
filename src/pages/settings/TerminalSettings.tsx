import { useState } from "react";
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

export function TerminalSettings() {
  const { t, activeWorkspace, sessions, restartSession, closeSession, preferredShell, setPreferredShell, setError } = useSpace();
  const [prefs, setPrefs] = useState<TerminalPrefs>(() => loadTerminalPrefs());
  const [busySession, setBusySession] = useState<string | null>(null);
  const ids = activeWorkspace ? collectSessionIds(activeWorkspace.layout) : [];
  const liveSessions = ids.map((id) => sessions[id]).filter((session) => Boolean(session));
  const patch = (value: Partial<TerminalPrefs>) => setPrefs((current) => {
    const next = { ...current, ...value };
    saveTerminalPrefs(next);
    return next;
  });
  const runSessionAction = async (id: string, action: () => Promise<void>) => {
    setBusySession(id);
    try { await action(); } catch (error) { setError(String(error)); } finally { setBusySession(null); }
  };

  return (
    <section className="vs-settingsPanelBody vs-terminalSettings">
      <h2>{t("settings.terminal")}</h2>
      <p className="vs-settingsHint">{t("settings.terminalHint")}</p>

      <div className="vs-terminalSettingsGroup">
        <h3>{t("settings.termInteraction")}</h3>
        <p className="vs-settingsHint">{t("settings.termInteractionHint")}</p>
        <div className="vs-terminalRangeGrid">
          <label className="vs-terminalRangeCard">
            <span>{t("settings.termNormalScroll")}<b>{prefs.scrollSpeed.toFixed(2)}×</b></span>
            <small>{t("settings.termNormalScrollHint")}</small>
            <input type="range" min="0.5" max="3" step="0.05" value={prefs.scrollSpeed} onChange={(event) => patch({ scrollSpeed: Number(event.target.value) })} />
            <span className="vs-terminalRangeEnds"><small>0.5×</small><small>3×</small></span>
          </label>
          <label className="vs-terminalRangeCard">
            <span>{t("settings.termFastScroll")}<b>{prefs.fastScrollSpeed.toFixed(1)}×</b></span>
            <small>{t("settings.termFastScrollHint")}</small>
            <input type="range" min="1" max="10" step="0.25" value={prefs.fastScrollSpeed} onChange={(event) => patch({ fastScrollSpeed: Number(event.target.value) })} />
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
        {navigator.userAgent.includes("Windows") ? <label className="vs-terminalSettingField"><span>{t("settings.termPowerShell")}</span>
          <select value={preferredShell} onChange={(event) => setPreferredShell(event.target.value)}>
            {TERMINAL_OPTIONS.map((option) => <option key={option.value || "auto"} value={option.value}>{option.label}</option>)}
          </select>
        </label> : null}
        <button className="vs-btn vs-btnGhost" type="button" onClick={() => { const next = { ...DEFAULT_TERMINAL_PREFS }; saveTerminalPrefs(next); setPrefs(next); setPreferredShell(""); }}>{t("settings.termReset")}</button>
      </div>

      <div className="vs-terminalSettingsGroup">
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
      </div>
    </section>
  );
}
