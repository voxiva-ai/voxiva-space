import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, CircleHelp, Compass, ExternalLink, Flag, Github, Keyboard, MessageSquare, RefreshCw, RotateCcw, ScrollText } from "lucide-react";
import { IconX } from "@/components/icons";
import { ConfirmDialog } from "@/components/PromptDialog";
import { checkForUpdates, openUpdateUrl, type UpdateCheckResult } from "@/features/updates/api";
import { openUrl } from "@/features/terminal/api";
import { invoke } from "@/platform/desktop";
import { useSpace, useView } from "@/features/workspace/SpaceContext";

export function HelpMenu() {
  const { locale, setError, t } = useSpace();
  const { setView } = useView();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null);
  const [message, setMessage] = useState("");
  const [restartConfirm, setRestartConfirm] = useState(false);

  useLayoutEffect(() => {
    const panel = menu.current;
    const anchor = trigger.current?.getBoundingClientRect();
    if (!panel) return;
    if (!open) {
      if (panel.matches(":popover-open")) panel.hidePopover();
      return;
    }
    if (!panel.matches(":popover-open")) panel.showPopover();
    if (!anchor) return;
    const margin = 8;
    const gap = 8;
    const width = Math.min(244, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - width - margin));
    const maxHeight = Math.max(0, anchor.top - gap - margin);
    const height = Math.min(panel.scrollHeight, maxHeight);
    Object.assign(panel.style, {
      width: `${width}px`,
      left: `${left}px`,
      maxHeight: `${maxHeight}px`,
      top: `${Math.max(margin, anchor.top - height - gap)}px`,
      transformOrigin: "bottom left",
    });
  }, [open]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("voxiva-native-overlay", { detail: { key: "status-help-menu", active: open } }));
    return () => { window.dispatchEvent(new CustomEvent("voxiva-native-overlay", { detail: { key: "status-help-menu", active: false } })); };
  }, [open]);

  async function checkUpdates() {
    setBusy(true);
    setMessage("");
    try {
      const result = await checkForUpdates();
      setUpdate(result);
      setMessage(result.updateAvailable ? t("help.updateAvailable").replace("{version}", result.latestVersion) : t("help.updateCurrent"));
    } catch (error) {
      setUpdate(null);
      setMessage(t("help.updateFailed"));
      setError(String(error));
    } finally { setBusy(false); }
  }

  function closeMenu() { menu.current?.hidePopover(); setOpen(false); }
  function openLink(url: string) { closeMenu(); void openUrl(url).catch((error) => setError(String(error))); }
  function openSettings(section: "hotkeys" | "about") {
    closeMenu();
    sessionStorage.setItem("voxiva-open-settings-section", section);
    window.dispatchEvent(new CustomEvent("voxiva-settings-section", { detail: section }));
    setView("settings");
  }

  return <>
    <div className="vs-statusHelpWrap">
      <button ref={trigger} type="button" className="vs-iconBtn vs-statusHelpButton vs-helpBtn" title={t("help.title")} aria-label={t("help.title")} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <CircleHelp size={15} aria-hidden="true" />
      </button>
      <div ref={menu} id="status-help-menu" className="vs-chromeFlyout is-menu is-wide vs-helpMenu vs-statusHelpMenu" popover="auto" role="menu" aria-label={t("help.menuTitle")} onToggle={(event) => setOpen(event.newState === "open")}>
        <div className="vs-helpMenuHeader"><strong>{t("help.menuTitle")}</strong><button type="button" className="vs-iconBtn vs-closeIconButton vs-helpMenuClose" aria-label={t("help.close")} title={t("help.close")} onClick={closeMenu}><IconX size={14} /></button></div>
        <button type="button" role="menuitem" onClick={() => openSettings("hotkeys")}><Keyboard size={14} aria-hidden="true" />{t("help.keyboardShortcuts")}</button>
        <div className="vs-chromeMenuSep" role="separator" />
        <button type="button" role="menuitem" onClick={() => openLink("https://github.com/voxiva-ai/voxiva-space/issues/new")}><MessageSquare size={14} aria-hidden="true" />{t("help.sendFeedback")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
        <button type="button" role="menuitem" onClick={() => openLink("https://github.com/voxiva-ai/voxiva-space/milestones")}><Flag size={14} aria-hidden="true" />{t("help.milestones")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
        <button type="button" role="menuitem" onClick={() => { closeMenu(); window.dispatchEvent(new CustomEvent("voxiva-help-open")); }}><Compass size={14} aria-hidden="true" />{t("help.onboarding")}</button>
        <button type="button" role="menuitem" onClick={() => openLink(locale === "ru" ? "https://github.com/voxiva-ai/voxiva-space/blob/main/README.ru.md" : "https://github.com/voxiva-ai/voxiva-space#readme")}><BookOpen size={14} aria-hidden="true" />{t("help.docs")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
        <button type="button" role="menuitem" onClick={() => openLink("https://github.com/voxiva-ai/voxiva-space/releases")}><ScrollText size={14} aria-hidden="true" />{t("help.changelog")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
        <div className="vs-chromeMenuSep" role="separator" />
        <button type="button" role="menuitem" onClick={() => openLink("https://github.com/voxiva-ai/voxiva-space")}><Github size={14} aria-hidden="true" />{t("help.github")}<ExternalLink size={12} className="vs-helpMenuExternal" /></button>
        <div className="vs-chromeMenuSep" role="separator" />
        <button type="button" role="menuitem" disabled={busy} onClick={() => void checkUpdates()}><RefreshCw size={14} aria-hidden="true" className={busy ? "vs-helpMenuSpin" : ""} />{busy ? t("help.checkingUpdates") : t("help.checkUpdates")}</button>
        {message && <div className="vs-helpMenuUpdate" role="status">{message}{update?.updateAvailable && <button type="button" onClick={() => void openUpdateUrl(update.downloadUrl).catch((error) => setError(String(error)))}>{t("help.downloadUpdate")}</button>}</div>}
        <div className="vs-chromeMenuSep" role="separator" />
        <button type="button" role="menuitem" onClick={() => { closeMenu(); setRestartConfirm(true); }}><RotateCcw size={14} aria-hidden="true" />{t("help.restartApp")}</button>
      </div>
    </div>
    <ConfirmDialog open={restartConfirm} title={t("help.restartTitle")} body={t("help.restartHint")} confirmLabel={t("help.restartApp")} cancelLabel={t("projects.cancel")} onCancel={() => setRestartConfirm(false)} onConfirm={() => { setRestartConfirm(false); void invoke("app_restart").catch((error) => setError(String(error))); }} />
  </>;
}
