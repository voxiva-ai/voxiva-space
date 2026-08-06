import { useEffect, useRef, useState } from "react";
import { browserCloseAll } from "@/features/browser/api";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { Locale } from "@/i18n";
import type { ThemeId } from "@/features/workspace/persist";
import { Check } from "@untitledui/icons";
import {
  HOTKEY_GROUPS,
  HOTKEY_LABELS,
  bindingFromEvent,
  formatHotkey,
  loadHotkeys,
  saveHotkeys,
  type HotkeyAction,
  type HotkeyMap,
  DEFAULT_HOTKEYS,
} from "@/features/hotkeys/bindings";
import {
  companionStart,
  companionStatus,
  companionStop,
  type CompanionStatus,
} from "@/features/companion/api";
import { CompanionQrCode } from "@/features/companion/QrCode";
import { loadCompanionToken, rotateCompanionToken } from "@/features/companion/pairing";
import { clientError } from "@/lib/errors";
import { listen } from "@tauri-apps/api/event";
import {
  DEFAULT_SOUND_PREFS,
  loadSoundPrefs,
  playNotifySound,
  readCustomSound,
  saveSoundPrefs,
  type SoundPrefs,
  type SoundPreset,
} from "@/features/sounds/prefs";

type SectionId = "general" | "appearance" | "sounds" | "hotkeys" | "mobile" | "welcome";

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
    resetOnboarding,
    locale,
    setLocale,
    theme,
    setTheme,
    t,
    activeWorkspace,
    workspaces,
    setError,
  } = useSpace();
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => loadHotkeys());
  const [listening, setListening] = useState<HotkeyAction | null>(null);
  const [section, setSection] = useState<SectionId>("appearance");
  const [token, setToken] = useState(() => loadCompanionToken());
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [sounds, setSounds] = useState<SoundPrefs>(() => loadSoundPrefs());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void browserCloseAll().catch(() => undefined);
  }, []);

  useEffect(() => {
    void companionStatus()
      .then(setStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (section !== "mobile") return;
    const timer = window.setInterval(() => {
      void companionStatus()
        .then(setStatus)
        .catch(() => undefined);
    }, 2000);
    const unlisten = listen("companion://paired", () => {
      void companionStatus().then(setStatus).catch(() => undefined);
    });
    return () => {
      window.clearInterval(timer);
      void unlisten.then((u) => u());
    };
  }, [section]);

  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = bindingFromEvent(event);
      if (!next) return;
      setHotkeys((current) => {
        const updated = { ...current, [listening]: next };
        saveHotkeys(updated);
        window.dispatchEvent(new Event("voxiva-hotkeys-changed"));
        return updated;
      });
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);

  function patchSounds(patch: Partial<SoundPrefs>) {
    setSounds((current) => {
      const next = { ...current, ...patch };
      saveSoundPrefs(next);
      return next;
    });
  }

  const themes: Array<{
    id: ThemeId;
    label: string;
    hint: string;
    colors: [string, string, string, string];
  }> = [
    {
      id: "default",
      label: t("settings.themeDefault"),
      hint: t("settings.themeDefaultHint"),
      colors: ["#080a0f", "#10151e", "#4d9dff", "#e9edf5"],
    },
    {
      id: "dracula",
      label: t("settings.themeDracula"),
      hint: t("settings.themeDraculaHint"),
      colors: ["#181a24", "#282a36", "#ff79c6", "#f8f8f2"],
    },
    {
      id: "dark",
      label: t("settings.themeDark"),
      hint: t("settings.themeDarkHint"),
      colors: ["#000000", "#111111", "#ffffff", "#f5f5f5"],
    },
    {
      id: "gruvbox",
      label: t("settings.themeGruvbox"),
      hint: t("settings.themeGruvboxHint"),
      colors: ["#1d2021", "#3c3836", "#fe8019", "#ebdbb2"],
    },
    {
      id: "cyber",
      label: t("settings.themeCyber"),
      hint: t("settings.themeCyberHint"),
      colors: ["#06171b", "#0b2a30", "#7567e8", "#d8f3f1"],
    },
    {
      id: "glass",
      label: t("settings.themeGlass"),
      hint: t("settings.themeGlassHint"),
      colors: ["#1a2233aa", "#2a3548aa", "#6eb0ff", "#f2f5fb"],
    },
    {
      id: "light",
      label: t("settings.themeLight"),
      hint: t("settings.themeLightHint"),
      colors: ["#f3f5f9", "#ffffff", "#2563eb", "#0f172a"],
    },
  ];

  const nav: Array<{ id: SectionId; title: string }> = [
    { id: "general", title: t("settings.language") },
    { id: "appearance", title: t("settings.theme") },
    { id: "sounds", title: t("settings.sounds") },
    { id: "hotkeys", title: t("settings.hotkeys") },
    { id: "mobile", title: t("settings.mobile") },
    { id: "welcome", title: t("settings.welcome") },
  ];

  async function enableCompanion() {
    setBusy(true);
    try {
      const next = await companionStart(token, activeWorkspace?.id ?? null);
      setStatus(next);
    } catch (error) {
      setError(clientError(error));
    } finally {
      setBusy(false);
    }
  }

  async function disableCompanion() {
    setBusy(true);
    try {
      const next = await companionStop();
      setStatus(next);
    } catch (error) {
      setError(clientError(error));
    } finally {
      setBusy(false);
    }
  }

  async function rotateCode() {
    const nextToken = rotateCompanionToken();
    setToken(nextToken);
    if (status?.running) {
      setBusy(true);
      try {
        const next = await companionStart(nextToken, activeWorkspace?.id ?? null);
        setStatus(next);
      } catch (error) {
        setError(clientError(error));
      } finally {
        setBusy(false);
      }
    }
  }

  const pairUrl = status?.pairUrl ?? status?.deepLink ?? "";
  const installPageUrl =
    status?.installPageUrl ?? "https://voxivaai.vercel.app/products/voxiva-space/mobile";
  const stateLabel = !status?.running
    ? t("settings.mobileOff")
    : status.paired
      ? t("settings.mobilePaired")
      : t("settings.mobileWaiting");

  const presets: Array<{ id: SoundPreset; label: string }> = [
    { id: "bell", label: t("settings.soundBell") },
    { id: "soft", label: t("settings.soundSoft") },
    { id: "chime", label: t("settings.soundChime") },
    { id: "custom", label: t("settings.soundCustom") },
  ];

  return (
    <div className="vs-settingsLayout">
      <aside className="vs-settingsNav" aria-label={t("settings.title")}>
        <div className="vs-settingsNavTitle">{t("settings.title")}</div>
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`vs-settingsNavItem${section === item.id ? " is-active" : ""}`}
            onClick={() => setSection(item.id)}
          >
            {item.title}
          </button>
        ))}
      </aside>

      <div className="vs-settingsPanel">
        {section === "general" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.language")}</h2>
            <p className="vs-settingsHint">{t("settings.languageHint")}</p>
            <div className="vs-langRow">
              {(
                [
                  { id: "en" as Locale, label: "English", hint: "EN" },
                  { id: "ru" as Locale, label: "Русский", hint: "RU" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`vs-langChip${locale === item.id ? " is-active" : ""}`}
                  onClick={() => setLocale(item.id)}
                >
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                  {locale === item.id && (
                    <span className="vs-themeCheck" aria-hidden>
                      <Check size={14} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {section === "appearance" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.theme")}</h2>
            <p className="vs-settingsHint">{t("settings.themeHint")}</p>
            <div className="vs-themeRow">
              {themes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`vs-themeChip${theme === item.id ? " is-active" : ""}`}
                  onClick={() => setTheme(item.id)}
                >
                  <span
                    className="vs-themePreview"
                    style={{
                      background: item.colors[0],
                      color: item.colors[3],
                      borderColor: item.colors[1],
                    }}
                  >
                    <i className="vs-themePreviewDots">•••</i>
                    <i style={{ background: item.colors[1] }} />
                    <i style={{ background: item.colors[1] }} />
                    <i style={{ background: item.colors[2] }} />
                  </span>
                  <span className="vs-themeCopy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                  {theme === item.id && (
                    <span className="vs-themeCheck" aria-hidden>
                      <Check size={14} />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <h2 style={{ marginTop: "2rem" }}>{t("settings.zoom")}</h2>
            <p className="vs-settingsHint">{t("settings.zoomHint")}</p>
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

        {section === "mobile" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.mobile")}</h2>
            <p className="vs-settingsHint">{t("settings.mobileHint")}</p>

            <div className="vs-companionCard">
              <div className="vs-companionMeta">
                <span
                  className={`vs-companionBadge${status?.paired ? " is-on" : status?.running ? " is-wait" : ""}`}
                >
                  {stateLabel}
                </span>
                <p>{t("settings.mobileScan")}</p>
                <div className="vs-companionActions">
                  <a
                    className="vs-btn vs-btnGhost"
                    href={installPageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("settings.mobileDownload")}
                  </a>
                  {status?.running ? (
                    <button
                      type="button"
                      className="vs-btn"
                      disabled={busy}
                      onClick={() => void disableCompanion()}
                    >
                      {t("settings.mobileDisable")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="vs-btn vs-btnPrimary"
                      disabled={busy}
                      onClick={() => void enableCompanion()}
                    >
                      {t("settings.mobileEnable")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="vs-btn vs-btnGhost"
                    disabled={busy || !status?.running}
                    onClick={() => void rotateCode()}
                  >
                    {t("settings.mobileRotate")}
                  </button>
                </div>
              </div>
              <div className="vs-companionQrWrap">
                {pairUrl ? (
                  <CompanionQrCode value={pairUrl} size={196} label={t("settings.mobile")} />
                ) : (
                  <div className="vs-companionQrPlaceholder">{t("settings.mobileOff")}</div>
                )}
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
                  {group.actions.map((id) => (
                    <li key={id}>
                      <span>{t(HOTKEY_LABELS[id])}</span>
                      <button
                        type="button"
                        className={`vs-hotkeyEdit${listening === id ? " is-listening" : ""}`}
                        onClick={() => setListening(id)}
                      >
                        {listening === id ? t("settings.hk.press") : formatHotkey(hotkeys[id])}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {section === "welcome" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.welcome")}</h2>
            <button type="button" className="vs-btn vs-btnPrimary" onClick={() => void resetOnboarding()}>
              {t("settings.showWelcome")}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
