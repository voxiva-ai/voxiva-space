import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check } from "@untitledui/icons";
import { useSpace } from "@/features/workspace/SpaceContext";
import type { Locale } from "@/i18n";
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
    showWelcomeScreen,
    skipWelcome,
    setSkipWelcome,
    locale,
    setLocale,
    theme,
    setTheme,
    t,
    workspaces,
    setError,
  } = useSpace();
  const [hotkeys, setHotkeys] = useState<HotkeyMap>(() => loadHotkeys());
  const [listening, setListening] = useState<HotkeyAction | null>(null);
  const [section, setSection] = useState<SectionId>("general");
  const [sounds, setSounds] = useState<SoundPrefs>(() => loadSoundPrefs());
  const [attention, setAttention] = useState<AttentionPrefs>(() => loadAttentionPrefs());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCapturingHotkey(Boolean(listening));
    return () => setCapturingHotkey(false);
  }, [listening]);

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
    { id: "general", title: t("settings.language") },
    { id: "appearance", title: t("settings.theme") },
    { id: "sounds", title: t("settings.sounds") },
    { id: "hotkeys", title: t("settings.hotkeys") },
    { id: "mobile", title: t("settings.mobile") },
    { id: "welcome", title: t("settings.welcome") },
  ];

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
                            Light
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
                            Dark
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <h2 style={{ marginTop: "2rem" }}>{t("settings.attentionRing")}</h2>
            <p className="vs-settingsHint">{t("settings.attentionRingHint")}</p>
            <div className="vs-soundCard">
              <div className="vs-soundRow">
                <div>
                  <strong>{t("settings.attentionRing")}</strong>
                  <small>{t("settings.attentionRingHint")}</small>
                </div>
                <Toggle
                  on={attention.ringEnabled}
                  label={t("settings.attentionRing")}
                  onClick={() => patchAttention({ ringEnabled: !attention.ringEnabled })}
                />
              </div>
              <div className="vs-soundRow">
                <div>
                  <strong>{t("settings.attentionNotify")}</strong>
                  <small>{t("settings.attentionNotifyHint")}</small>
                </div>
                <Toggle
                  on={attention.notifyEnabled}
                  label={t("settings.attentionNotify")}
                  onClick={() => patchAttention({ notifyEnabled: !attention.notifyEnabled })}
                />
              </div>
              <div className="vs-soundSection">
                <div className="vs-hotkeyGroupTitle">{t("settings.attentionColor")}</div>
                <div className="vs-attentionSwatches">
                  {ATTENTION_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`vs-attentionSwatch${attention.ringColor === color ? " is-active" : ""}`}
                      style={{ background: color }}
                      title={color}
                      aria-label={color}
                      onClick={() => patchAttention({ ringColor: color })}
                    />
                  ))}
                </div>
              </div>
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

        {section === "welcome" && (
          <section className="vs-settingsPanelBody">
            <h2>{t("settings.welcome")}</h2>
            <p className="vs-settingsHint">{t("settings.welcomeHint")}</p>
            <div className="vs-soundCard">
              <div className="vs-soundRow">
                <div>
                  <strong>{t("settings.skipWelcome")}</strong>
                  <small>{t("settings.skipWelcomeHint")}</small>
                </div>
                <Toggle
                  on={skipWelcome}
                  label={t("settings.skipWelcome")}
                  onClick={() => setSkipWelcome(!skipWelcome)}
                />
              </div>
            </div>
            <div className="vs-settingsActions">
              <button
                type="button"
                className="vs-btn vs-btnPrimary vs-settingsWelcomeBtn"
                onClick={() => showWelcomeScreen()}
              >
                {t("settings.showWelcome")}
              </button>
              <p className="vs-settingsHint">{t("settings.showWelcomeHint")}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
