import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bell, Brush, Check, ExternalLink, Globe, Info, Keyboard, RefreshCw, Search, Settings, Smartphone, SquareTerminal, Users, Volume2 } from "lucide-react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import {
  appearanceForFamilyCard,
  familyOf,
  getTheme,
  loadFamilyAppearancePrefs,
  listThemeFamilies,
  previewForFamily,
  saveFamilyAppearancePrefs,
  themeIdForAppearance,
  type FamilyAppearancePrefs,
  type ThemeAppearance,
} from "@/features/theme";
import {
  HOTKEY_GROUPS,
  HOTKEY_LABELS,
  bindingFromEvent,
  bindingsEqual,
  formatHotkey,
  loadHotkeys,
  saveHotkeys,
  setCapturingHotkey,
  type HotkeyAction,
  type HotkeyMap,
  DEFAULT_HOTKEYS,
} from "@/features/hotkeys/bindings";
import { clientError } from "@/lib/errors";
import { ZoomControls } from "@/components/shell/ZoomControls";
import {
  DEFAULT_SOUND_PREFS,
  loadSoundPrefs,
  playNotifySound,
  readCustomSound,
  saveSoundPrefs,
  type SoundPrefs,
  type SoundPreset,
} from "@/features/sounds/prefs";
import {
  ATTENTION_COLORS,
  loadAttentionPrefs,
  saveAttentionPrefs,
  type AttentionPrefs,
} from "@/features/attention/prefs";
import {
  checkForUpdates,
  getAppMetadata,
  openUpdateUrl,
  type UpdateCheckResult,
} from "@/features/updates/api";
import {
  ensureAutoCookieImport,
  loadAutoCookieStatus,
} from "@/features/browser/autoCookies";
import { TerminalSettings } from "./TerminalSettings";
import { agentBots, isBotReady } from "@/features/agents/bots";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { loadAgentPrefs, saveAgentPrefs } from "@/features/agents/prefs";

type SectionId = "general" | "agents" | "appearance" | "notifications" | "sounds" | "hotkeys" | "terminal" | "browser" | "mobile" | "about";

const AGENT_INSTALL_GUIDES: Record<string, string> = {
  claude: "https://docs.anthropic.com/en/docs/claude-code/getting-started",
  codex: "https://help.openai.com/en/articles/11096431-openai-codex-cli-getting-started",
  opencode: "https://opencode.ai/docs/",
  gemini: "https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/installation.mdx",
  aider: "https://aider.chat/docs/install.html",
  "cursor-agent": "https://docs.cursor.com/en/cli/installation",
  amp: "https://ampcode.com/docs/cli",
  goose: "https://block.github.io/goose/docs/getting-started/installation",
  copilot: "https://docs.github.com/en/copilot/get-started/cli-quickstart",
  "claude-teams": "https://docs.anthropic.com/en/docs/claude-code/agent-teams",
  openclaude: "https://github.com/search?q=openclaude+coding+agent&type=repositories",
  grok: "https://grok.com/",
  opencode2: "https://opencode.ai/docs/",
  mimo: "https://github.com/XiaomiMiMo",
  ante: "https://github.com/search?q=ante+coding+agent&type=repositories",
  trae: "https://www.trae.ai/",
  muse: "https://github.com/search?q=muse+coding+agent+CLI&type=repositories",
  "deepseek-harness": "https://github.com/deepseek-ai/deepseek-harness",
  qoder: "https://qoder.com/cli",
  "qoder-cn": "https://qoder.com/cli",
  zcode: "https://github.com/search?q=zcode+coding+agent+CLI&type=repositories",
  pi: "https://github.com/badlogic/pi-mono",
  omp: "https://github.com/can1357/oh-my-pi",
  "prime-agent": "https://github.com/PrimeIntellect-ai/prime-agent",
  antigravity: "https://antigravity.google/",
  kilocode: "https://kilo.ai/",
  kiro: "https://kiro.dev/cli/",
  charm: "https://github.com/charmbracelet/crush",
  auggie: "https://docs.augmentcode.com/cli/overview",
  autohand: "https://www.autohand.ai/code/",
  cline: "https://github.com/cline/cline",
  codebuff: "https://www.codebuff.com/docs/help/quick-start",
  freebuff: "https://github.com/CodebuffAI/freebuff",
  "command-code": "https://github.com/search?q=command-code+AI+agent&type=repositories",
  continue: "https://docs.continue.dev/cli/overview",
  droid: "https://docs.factory.ai/cli/getting-started/overview",
  kimi: "https://moonshotai.github.io/kimi-cli/",
  "mistral-vibe": "https://github.com/mistralai/mistral-vibe",
  qwen: "https://github.com/QwenLM/qwen-code",
  "rovo-dev": "https://support.atlassian.com/rovo/docs/use-rovo-dev-cli/",
  hermes: "https://hermesagent.tools/install/",
  devin: "https://devin.ai/",
  openclaw: "https://github.com/openclaw/openclaw",
  codebuddy: "https://www.codebuddy.ai/",
  jcode: "https://github.com/search?q=jcode+coding+agent&type=repositories",
};

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`vs-toggle${on ? " is-on" : ""}`}
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
    >
      <i />
    </button>
  );
}

export function SettingsPage() {
  const {
    locale,
    theme,
    setTheme,
    t,
    workspaces,
    setError,
    autoResumeAgents,
    setAutoResumeAgents,
    agentAvailability,
    agentsScanned,
    refreshAgents,
  } = useSpace();
  const { setView } = useView();
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => loadHotkeys());
  const [listening, setListening] = useState<HotkeyAction | null>(null);
  const [section, setSection] = useState<SectionId>("general");
  const [navFilter, setNavFilter] = useState("");
  const [agentPrefs, setAgentPrefs] = useState(() => loadAgentPrefs());
  const [sounds, setSounds] = useState<SoundPrefs>(() => loadSoundPrefs());
  const [attention, setAttention] = useState<AttentionPrefs>(() => loadAttentionPrefs());
  const fileRef = useRef<HTMLInputElement>(null);
  const navSearchRef = useRef<HTMLInputElement>(null);
  const [appVersion, setAppVersion] = useState("…");
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState(false);

  useEffect(() => {
    setCapturingHotkey(Boolean(listening));
    return () => setCapturingHotkey(false);
  }, [listening]);

  useEffect(() => {
    void getAppMetadata()
      .then((m) => setAppVersion(m.version))
      .catch(() => setAppVersion("0.1.0"));
  }, []);

  const [cookieBusy, setCookieBusy] = useState(false);
  const [cookieStatus, setCookieStatus] = useState<string | null>(null);

  useEffect(() => {
    if (section !== "browser") return;
    const last = loadAutoCookieStatus();
    if (!last) {
      setCookieStatus(null);
      return;
    }
    if (!last.ok) {
      setCookieStatus(last.message || t("settings.browserImportFail"));
      return;
    }
    setCookieStatus(
      t("settings.browserImportOk")
        .replace("{n}", String(last.imported))
        .replace("{skip}", String(last.skipped))
        .replace("{source}", last.source),
    );
  }, [section, t]);

  async function runCookieImport(force = false) {
    setCookieBusy(true);
    setCookieStatus(null);
    try {
      const result = await ensureAutoCookieImport(force);
      if (!result) return;
      if (!result.ok) {
        setCookieStatus(result.message || t("settings.browserImportFail"));
        return;
      }
      setCookieStatus(
        t("settings.browserImportOk")
          .replace("{n}", String(result.imported))
          .replace("{skip}", String(result.skipped))
          .replace("{source}", result.source),
      );
    } catch (err) {
      setError(clientError(err));
      setCookieStatus(null);
    } finally {
      setCookieBusy(false);
    }
  }

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setListening(null);
        return;
      }
      const next = bindingFromEvent(event);
      if (!next) return;
      setHotkeys((current) => {
        const updated = { ...current };
        for (const action of Object.keys(updated) as HotkeyAction[]) {
          if (action !== listening && bindingsEqual(updated[action], next)) {
            updated[action] = current[listening];
          }
        }
        updated[listening] = next;
        saveHotkeys(updated);
        window.dispatchEvent(new Event("voxiva-hotkeys-changed"));
        return updated;
      });
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        navSearchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  function patchSounds(patch: Partial<SoundPrefs>) {
    setSounds((current) => {
      const next = { ...current, ...patch };
      saveSoundPrefs(next);
      return next;
    });
  }

  function patchAttention(patch: Partial<AttentionPrefs>) {
    setAttention((current) => {
      const next = { ...current, ...patch };
      saveAttentionPrefs(next);
      return next;
    });
  }

  function patchAgentPrefs(patch: Partial<typeof agentPrefs>) {
    setAgentPrefs((current) => {
      const next = { ...current, ...patch };
      saveAgentPrefs(next);
      return next;
    });
  }

  const themeFamilies = useMemo(() => listThemeFamilies(), []);
  const activeFamily = familyOf(theme);
  const activeAppearance = getTheme(theme).appearance;
  const [familyPrefs, setFamilyPrefs] = useState<FamilyAppearancePrefs>(() =>
    loadFamilyAppearancePrefs(),
  );

  useEffect(() => {
    // Keep memory in sync when theme is applied (incl. Light/Dark of this pack).
    setFamilyPrefs((current) => {
      if (current[activeFamily.familyId] === activeAppearance) return current;
      const next = { ...current, [activeFamily.familyId]: activeAppearance };
      saveFamilyAppearancePrefs(next);
      return next;
    });
  }, [activeAppearance, activeFamily.familyId]);

  function rememberFamilyAppearance(familyId: string, appearance: ThemeAppearance) {
    setFamilyPrefs((current) => {
      const next = { ...current, [familyId]: appearance };
      saveFamilyAppearancePrefs(next);
      return next;
    });
  }

  /** Click card body → open that pack (restore its last Light/Dark). */
  function selectFamily(familyId: string) {
    const family = themeFamilies.find((f) => f.familyId === familyId);
    if (!family) return;
    const appearance = appearanceForFamilyCard(
      family,
      familyPrefs,
      activeFamily.familyId,
      activeAppearance,
    );
    // If selecting the already-active family via body, keep current appearance.
    const nextAppearance =
      family.familyId === activeFamily.familyId
        ? activeAppearance
        : appearance;
    rememberFamilyAppearance(family.familyId, nextAppearance);
    setTheme(themeIdForAppearance(family, nextAppearance));
  }

  /** Light / Dark on a dual pack → switch THAT pack only. */
  function selectFamilyAppearance(familyId: string, appearance: ThemeAppearance) {
    const family = themeFamilies.find((f) => f.familyId === familyId);
    if (!family || !family.appearances.includes(appearance)) return;
    rememberFamilyAppearance(family.familyId, appearance);
    setTheme(themeIdForAppearance(family, appearance));
  }

  const nav: Array<{ id: SectionId; title: string }> = [
    { id: "general", title: t("settings.general") },
    { id: "agents", title: t("settings.agents") },
    { id: "appearance", title: t("settings.appearance") },
    { id: "notifications", title: t("settings.notifications") },
    { id: "sounds", title: t("settings.sounds") },
    { id: "hotkeys", title: t("settings.hotkeys") },
    { id: "terminal", title: t("settings.terminal") },
    { id: "browser", title: t("settings.browser") },
    { id: "mobile", title: t("settings.mobile") },
    { id: "about", title: t("settings.about") },
  ];
  const navGroups = [
    { title: t("settings.groupInterface"), items: [nav[0], ...nav.slice(2, 6)] },
    { title: t("settings.groupWorkspace"), items: [nav[1], ...nav.slice(6, 9)] },
    { title: t("settings.groupApp"), items: nav.slice(9) },
  ];
  const filteredNavGroups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.title.toLowerCase().includes(navFilter.trim().toLowerCase())),
  })).filter((group) => group.items.length > 0);
  const navIcons = { general: Settings, agents: Users, appearance: Brush, notifications: Bell, sounds: Volume2, hotkeys: Keyboard, terminal: SquareTerminal, browser: Globe, mobile: Smartphone, about: Info };

  const presets: Array<{ id: SoundPreset; label: string }> = [
    { id: "bell", label: t("settings.soundBell") },
    { id: "soft", label: t("settings.soundSoft") },
    { id: "chime", label: t("settings.soundChime") },
    { id: "custom", label: t("settings.soundCustom") },
  ];

  return (
    <div className="vs-settingsLayout">
      <aside className="vs-settingsNav" aria-label={t("settings.title")}>
        <button type="button" className="vs-settingsBack" onClick={() => setView("space")}>
          <span aria-hidden="true">←</span>{t("settings.backToApp")}
        </button>
        <label className="vs-settingsSearch">
          <Search size={16} aria-hidden="true" />
          <input ref={navSearchRef} type="search" value={navFilter} onChange={(event) => setNavFilter(event.target.value)} placeholder={locale === "ru" ? "Поиск настроек" : "Search settings"} aria-label={locale === "ru" ? "Поиск настроек" : "Search settings"} />
          <kbd>Ctrl F</kbd>
        </label>
        {filteredNavGroups.map((group) => (
          <div className="vs-settingsNavGroup" key={group.title}>
            <div className="vs-settingsNavTitle">{group.title}</div>
            {group.items.map((item) => {
              const Icon = navIcons[item.id];
              return <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} className={`vs-settingsNavItem${section === item.id ? " is-active" : ""}`} onClick={() => setSection(item.id)}>
                <Icon size={15} aria-hidden="true" />{item.title}
              </button>;
            })}
          </div>
        ))}
        {!filteredNavGroups.length && <p className="vs-settingsNavEmpty">{locale === "ru" ? "Ничего не найдено" : "No settings found"}</p>}
      </aside>

      <div className="vs-settingsPanel">
        <header className="vs-settingsPageHead">
          <h1>{nav.find((item) => item.id === section)?.title}</h1>
        </header>
        {section === "general" && (
          <section className="vs-settingsPanelBody vs-settingsGeneral">
            <h2>{t("settings.language")}</h2>
            <p className="vs-settingsHint">{t("settings.languageHint")}</p>
            <LanguageSwitcher />

            <div className="vs-settingsBlock" style={{ marginTop: "1.25rem" }}>
              <div className="vs-settingsRow">
                <div>
                  <h3>{t("settings.autoResume")}</h3>
                  <p className="vs-settingsHint">{t("settings.autoResumeHint")}</p>
                </div>
                <Toggle
                  on={autoResumeAgents}
                  onClick={() => setAutoResumeAgents(!autoResumeAgents)}
                  label={t("settings.autoResume")}
                />
              </div>
            </div>
          </section>
        )}

        {section === "agents" && (
          <section className="vs-settingsPanelBody vs-agentSettings">
            <p className="vs-settingsHint">{t("settings.agentsHint")}</p>
            <div className="vs-settingsBlock">
              <div className="vs-settingsRow">
                <div><h3>{t("settings.defaultAgent")}</h3><p className="vs-settingsHint">{t("settings.defaultAgentHint")}</p></div>
                <select aria-label={t("settings.defaultAgent")} value={agentPrefs.defaultId} onChange={(e) => patchAgentPrefs({ defaultId: e.target.value })}>
                  <option value="auto">{t("settings.agentAuto")}</option><option value="none">{t("settings.agentNone")}</option>
                  {agentBots.filter((bot) => bot.id !== "shell" && agentPrefs.enabled.includes(bot.id) && isBotReady(bot, agentAvailability, agentsScanned)).map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                </select>
              </div>
            </div>
            <div className="vs-settingsPanelHead">
              <div><h2>{t("settings.agentCatalog")} <small className="vs-agentSettingsCount">{agentBots.length - 1}</small></h2><p className="vs-settingsHint">{t("settings.agentCatalogHint")}</p></div>
              <button type="button" className="vs-btn" onClick={() => void refreshAgents()}><RefreshCw size={14} aria-hidden="true" />{t("settings.refreshAgents")}</button>
            </div>
            <div className="vs-agentSettingsList">
              {agentBots.filter((bot) => bot.id !== "shell").map((bot) => {
                const ready = isBotReady(bot, agentAvailability, agentsScanned);
                const enabled = agentPrefs.enabled.includes(bot.id);
                return <div className={`vs-agentSettingsRow${ready ? " is-ready" : ""}`} key={bot.id}>
                  <span className={`vs-agentIcon is-${bot.id}`}><AgentBrandIcon id={bot.id} size={22} /></span>
                  <span className="vs-agentSettingsName"><strong>{bot.name}</strong><small>{bot.command}</small></span>
                  <span className={`vs-agentSettingsStatus${ready ? " is-ready" : ""}`}>{!agentsScanned ? t("settings.agentNotScanned") : ready ? t("settings.agentDetected") : t("settings.agentNotInstalled")}</span>
                  <div className="vs-agentSettingsActions">
                    {ready && <button type="button" className={`vs-agentAvailability${enabled ? " is-enabled" : ""}`} aria-pressed={enabled} onClick={() => patchAgentPrefs({ enabled: enabled ? agentPrefs.enabled.filter((id) => id !== bot.id) : [...agentPrefs.enabled, bot.id], ...(enabled && agentPrefs.defaultId === bot.id ? { defaultId: "auto" } : {}) })}>{enabled ? t("settings.agentEnabled") : t("settings.agentDisabled")}</button>}
                    <button type="button" className="vs-agentGuide" aria-label={ready ? t("settings.agentDocs") : t("settings.installGuide")} title={ready ? t("settings.agentDocs") : t("settings.installGuide")} onClick={() => void openUpdateUrl(AGENT_INSTALL_GUIDES[bot.id] ?? "https://github.com/search?q=" + encodeURIComponent(`${bot.name} CLI`))}><ExternalLink size={14} aria-hidden="true" /></button>
                  </div>
                </div>;
              })}
            </div>
          </section>
        )}

        {section === "appearance" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.theme")}</h2>
            <p className="vs-settingsHint">{t("settings.themeHint")}</p>
            <div className="vs-themeRow">
              {themeFamilies.map((family) => {
                const dual = family.appearances.length > 1;
                const active = activeFamily.familyId === family.familyId;
                const cardAppearance = appearanceForFamilyCard(
                  family,
                  familyPrefs,
                  activeFamily.familyId,
                  activeAppearance,
                );
                const def = previewForFamily(family, cardAppearance);
                const { tokens } = def;
                const [canvas, surface, accent, text] = tokens.preview;
                return (
                  <article
                    key={family.familyId}
                    className={`vs-themeChip${active ? " is-active" : ""}${dual ? " has-modes" : ""}`}
                    data-appearance={cardAppearance}
                    style={
                      {
                        "--chip-canvas": canvas,
                        "--chip-surface": surface,
                        "--chip-accent": accent,
                        "--chip-text": text,
                        "--chip-muted": tokens.muted,
                        "--chip-on-accent": tokens.onAccent,
                        "--chip-border": tokens.border,
                      } as CSSProperties
                    }
                  >
                    <button
                      type="button"
                      className="vs-themeChipHit"
                      onClick={() => selectFamily(family.familyId)}
                      aria-pressed={active}
                      aria-label={family.label}
                    >
                      <span className="vs-themeChipPreview" aria-hidden>
                        <span className="vs-themeChipPreviewDots">•••</span>
                        <span className="vs-themeChipPreviewBars">
                          <i />
                          <i />
                        </span>
                        <span className="vs-themeChipPreviewAccent" />
                      </span>

                      <span className="vs-themeChipMeta">
                        <strong className="vs-themeChipName">{family.label}</strong>
                        {active ? (
                          <span className="vs-themeChipCheck" aria-hidden>
                            <Check size={12} />
                          </span>
                        ) : (
                          <span className="vs-themeChipCheckSpacer" aria-hidden />
                        )}
                      </span>
                    </button>

                    {dual ? (
                      <div className="vs-themeChipModes" role="group" aria-label={t("settings.themeMode")}>
                        {family.appearances.includes("light") ? (
                          <button
                            type="button"
                            className={
                              active && activeAppearance === "light" ? "is-active" : undefined
                            }
                            aria-pressed={active && activeAppearance === "light"}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              selectFamilyAppearance(family.familyId, "light");
                            }}
                          >
                            {t("settings.themeLight")}
                          </button>
                        ) : null}
                        {family.appearances.includes("dark") ? (
                          <button
                            type="button"
                            className={
                              active && activeAppearance === "dark" ? "is-active" : undefined
                            }
                            aria-pressed={active && activeAppearance === "dark"}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              selectFamilyAppearance(family.familyId, "dark");
                            }}
                          >
                            {t("settings.themeDark")}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <h2 style={{ marginTop: "2rem" }}>{t("settings.zoom")}</h2>
            <p className="vs-settingsHint">{t("settings.zoomHint")}</p>
            <ZoomControls showRange />
          </section>
        )}

        {section === "notifications" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.notifications")}</h2>
            <p className="vs-settingsHint">{t("settings.notificationsHint")}</p>
            <div className="vs-soundCard">
              <div className="vs-soundRow">
                <div><strong>{t("settings.attentionNotify")}</strong><small>{t("settings.attentionNotifyHint")}</small></div>
                <Toggle on={attention.notifyEnabled} label={t("settings.attentionNotify")} onClick={() => patchAttention({ notifyEnabled: !attention.notifyEnabled })} />
              </div>
              <div className="vs-soundRow">
                <div><strong>{t("settings.attentionRing")}</strong><small>{t("settings.attentionRingHint")}</small></div>
                <Toggle on={attention.ringEnabled} label={t("settings.attentionRing")} onClick={() => patchAttention({ ringEnabled: !attention.ringEnabled })} />
              </div>
              <div className="vs-soundSection">
                <div className="vs-hotkeyGroupTitle">{t("settings.attentionColor")}</div>
                <div className="vs-attentionSwatches">
                  {ATTENTION_COLORS.map((color) => <button key={color} type="button" className={`vs-attentionSwatch${attention.ringColor === color ? " is-active" : ""}`} style={{ background: color }} title={color} aria-label={color} onClick={() => patchAttention({ ringColor: color })} />)}
                </div>
              </div>
            </div>
          </section>
        )}

        {section === "sounds" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.sounds")}</h2>
            <p className="vs-settingsHint">{t("settings.soundsHint")}</p>
            <div className="vs-soundCard">
              {(
                [
                  ["enabled", "settings.soundMaster", "settings.soundMasterHint"],
                  ["onAttention", "settings.soundAttention", "settings.soundAttentionHint"],
                  ["onExit", "settings.soundExit", "settings.soundExitHint"],
                  ["activeWorkspaceOnly", "settings.soundActiveOnly", "settings.soundActiveOnlyHint"],
                ] as const
              ).map(([key, title, hint]) => (
                <div key={key} className="vs-soundRow">
                  <div>
                    <strong>{t(title)}</strong>
                    <small>{t(hint)}</small>
                  </div>
                  <Toggle
                    on={Boolean(sounds[key])}
                    label={t(title)}
                    onClick={() => patchSounds({ [key]: !sounds[key] })}
                  />
                </div>
              ))}

              <div className="vs-soundSection">
                <div className="vs-hotkeyGroupTitle">{t("settings.soundPreset")}</div>
                <div className="vs-soundPresets">
                  {presets.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`vs-soundPreset${sounds.preset === item.id ? " is-active" : ""}`}
                      onClick={() => patchSounds({ preset: item.id })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="vs-soundActions">
                <button
                  type="button"
                  className="vs-btn"
                  onClick={() => playNotifySound("attention")}
                >
                  {t("settings.soundTest")}
                </button>
                <button
                  type="button"
                  className="vs-btn vs-btnGhost"
                  onClick={() => fileRef.current?.click()}
                >
                  {t("settings.soundUpload")}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void readCustomSound(file)
                      .then((customDataUrl) => {
                        patchSounds({ customDataUrl, preset: "custom" });
                      })
                      .catch((err) => setError(clientError(err)));
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  className="vs-btn vs-btnGhost"
                  onClick={() => {
                    const next = { ...DEFAULT_SOUND_PREFS };
                    saveSoundPrefs(next);
                    setSounds(next);
                  }}
                >
                  {t("settings.hk.reset")}
                </button>
              </div>

              {workspaces.length > 0 ? (
                <div className="vs-soundSection">
                  <div className="vs-hotkeyGroupTitle">{t("settings.soundMuteWs")}</div>
                  <div className="vs-workspaceMuteList">
                    {workspaces.map((ws) => {
                      const muted = sounds.mutedWorkspaces.includes(ws.id);
                      return (
                        <div key={ws.id} className="vs-workspaceMuteRow">
                          <span>{ws.name}</span>
                          <button
                            type="button"
                            className="vs-btn vs-btnGhost"
                            onClick={() => {
                              const mutedWorkspaces = muted
                                ? sounds.mutedWorkspaces.filter((id) => id !== ws.id)
                                : [...sounds.mutedWorkspaces, ws.id];
                              patchSounds({ mutedWorkspaces });
                            }}
                          >
                            {muted ? t("settings.soundMuteOn") : t("settings.soundMuteOff")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {section === "browser" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.browser")}</h2>
            <p className="vs-settingsHint">{t("settings.browserHint")}</p>

            <div className="vs-settingsBlock">
              <h3>{t("settings.browserPasskeys")}</h3>
              <p className="vs-settingsHint">{t("settings.browserPasskeysBody")}</p>
            </div>

            <div className="vs-settingsBlock">
              <h3>{t("settings.browserSessions")}</h3>
              <p className="vs-settingsHint">{t("settings.browserSessionsBody")}</p>
              {cookieStatus ? <p className="vs-settingsHint">{cookieStatus}</p> : null}
              <button
                type="button"
                className="vs-btn vs-btnPrimary"
                disabled={cookieBusy}
                onClick={() => void runCookieImport(true)}
              >
                {cookieBusy ? t("settings.browserImportRunning") : t("settings.browserResync")}
              </button>
              <p className="vs-settingsHint">{t("settings.browserImportTip")}</p>
            </div>
          </section>
        )}

        {section === "terminal" && <TerminalSettings />}

        {section === "mobile" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.mobile")}</h2>
            <p className="vs-settingsHint">{t("settings.mobileHint")}</p>

            <div className="vs-companionCard">
              <div className="vs-companionMeta">
                <span className="vs-companionBadge is-wait">{t("settings.mobileDev")}</span>
                <p>{t("settings.mobileDevBody")}</p>
              </div>
              <div className="vs-companionQrWrap">
                <div className="vs-companionQrPlaceholder">{t("settings.mobileDevShort")}</div>
              </div>
            </div>
          </section>
        )}

        {section === "hotkeys" && (
          <section className="vs-settingsPanelBody">
            <div className="vs-settingsPanelHead">
              <h2>{t("settings.hotkeys")}</h2>
              <button
                type="button"
                className="vs-btn"
                onClick={() => {
                  setHotkeys(DEFAULT_HOTKEYS);
                  saveHotkeys(DEFAULT_HOTKEYS);
                  window.dispatchEvent(new Event("voxiva-hotkeys-changed"));
                  setListening(null);
                }}
              >
                {t("settings.hk.reset")}
              </button>
            </div>
            <p className="vs-settingsHint">{t("settings.hotkeysHint")}</p>
            <p className="vs-settingsHint">{t("settings.hk.fixed")}</p>
            {HOTKEY_GROUPS.map((group) => (
              <div key={group.id} className="vs-hotkeyGroup">
                <div className="vs-hotkeyGroupTitle">{t(group.labelKey)}</div>
                <ul className="vs-hotkeyRows">
                  {group.actions.map((id) => {
                    const conflict = (Object.keys(hotkeys) as HotkeyAction[]).find(
                      (other) => other !== id && bindingsEqual(hotkeys[other], hotkeys[id]),
                    );
                    return (
                      <li key={id}>
                        <span>
                          {t(HOTKEY_LABELS[id])}
                          {conflict ? (
                            <small className="vs-hotkeyConflict">
                              {t("settings.hk.conflict")} {t(HOTKEY_LABELS[conflict])}
                            </small>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className={`vs-hotkeyEdit${listening === id ? " is-listening" : ""}${
                            conflict ? " is-conflict" : ""
                          }`}
                          onClick={() => setListening((cur) => (cur === id ? null : id))}
                        >
                          {listening === id ? t("settings.hk.press") : formatHotkey(hotkeys[id])}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}

        {section === "about" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.about")}</h2>
            <p className="vs-settingsHint">{t("settings.aboutHint")}</p>
            <div className="vs-soundCard">
              <div className="vs-soundRow">
                <div>
                  <strong>Voxiva Space v{appVersion}</strong>
                  <small>{t("settings.aboutBody")}</small>
                </div>
              </div>
            </div>
            <div className="vs-settingsActions" style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              <button type="button" className="vs-btn" onClick={() => void openUpdateUrl("https://github.com/voxiva-ai/voxiva-space/releases")}><ExternalLink size={14} aria-hidden="true" />{t("settings.installApp")}</button>
              <button type="button" className="vs-btn" onClick={() => void openUpdateUrl("https://github.com/voxiva-ai/voxiva-space#readme")}><ExternalLink size={14} aria-hidden="true" />{t("settings.installReadme")}</button>
              <button
                type="button"
                className="vs-btn vs-btnPrimary"
                disabled={updateBusy}
                onClick={() =>
                  void (async () => {
                    setUpdateBusy(true);
                    setUpdateError(false);
                    setUpdateInfo(null);
                    try {
                      setUpdateInfo(await checkForUpdates());
                    } catch {
                      setUpdateError(true);
                    } finally {
                      setUpdateBusy(false);
                    }
                  })()
                }
              >
                {updateBusy ? t("settings.updateChecking") : t("settings.updateCheck")}
              </button>
              {(updateInfo?.updateAvailable || updateError) && (
                <button
                  type="button"
                  className="vs-btn"
                  onClick={() =>
                    void openUpdateUrl(
                      updateInfo?.downloadUrl || updateInfo?.downloadsPage || "https://voxiva.ai/downloads",
                    )
                  }
                >
                  {updateInfo?.updateAvailable ? t("settings.updateDownload") : t("settings.updateOpenPage")}
                </button>
              )}
            </div>
            <p className="vs-settingsHint" style={{ marginTop: "0.75rem" }}>{t("settings.updateBehavior")}</p>
            <p className="vs-settingsHint" style={{ marginTop: "0.5rem" }}>{t("settings.installAppHint")}</p>
            {updateInfo?.updateAvailable ? (
              <p className="vs-settingsHint" style={{ marginTop: "0.75rem" }}>
                {t("settings.updateAvailable")
                  .replace("{latest}", updateInfo.latestVersion)
                  .replace("{current}", updateInfo.currentVersion)}
                {updateInfo.notes ? ` — ${updateInfo.notes}` : ""}
              </p>
            ) : null}
            {updateInfo && !updateInfo.updateAvailable ? (
              <p className="vs-settingsHint" style={{ marginTop: "0.75rem" }}>
                {t("settings.updateUpToDate")}
              </p>
            ) : null}
            {updateError ? (
              <p className="vs-settingsHint" style={{ marginTop: "0.75rem", color: "var(--vs-danger, #ff7b7b)" }}>
                {t("settings.updateFailed")}
              </p>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
}
