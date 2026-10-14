import { useEffect, useState } from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { loadTerminalPrefs, saveTerminalPrefs, subscribeTerminalPrefs, type TerminalPrefs } from "@/features/terminal/prefs";
import { loadStatusBarPrefs, saveStatusBarPrefs, subscribeStatusBarPrefs } from "@/features/ui/statusPrefs";
import { DropdownSelect } from "@/components/DropdownSelect";
import { SshSettings } from "./SshSettings";
import { ProviderAccountsSettings } from "./ProviderAccountsSettings";
import { OrchestrationSettings } from "./OrchestrationSettings";
import { VoiceSettings } from "./VoiceSettings";
import { RemoteServersSettings } from "./RemoteServersSettings";
import type { SectionId } from "./navigation";

const UNAVAILABLE: Partial<Record<SectionId, [string, string]>> = {
  account: ["Voxiva currently uses a local profile. Cloud sign-in, billing, and account sync are not connected in this build.", "Сейчас Voxiva использует локальный профиль. Облачный вход, оплата и синхронизация аккаунта в этой сборке не подключены."],
  voice: ["In-app dictation and speech recognition are not connected. Windows dictation remains available with Win + H in a text field.", "Диктовка и распознавание речи внутри приложения пока не подключены. Диктовку Windows можно вызвать сочетанием Win + H в текстовом поле."],
  "share-skills": ["Publishing and downloading shared skills require a skills service that is not connected yet. Installed CLI agents continue to use their own skills.", "Публикация и загрузка общих навыков требуют сервиса, который пока не подключён. Установленные CLI-агенты используют собственные навыки."],
  "mobile-emulator": ["A mobile device emulator is not included in this build. Mobile companion access and the embedded browser are separate features.", "Эмулятор мобильного устройства в этой сборке отсутствует. Подключение телефона и встроенный браузер — отдельные возможности."],
  "floating-workspace": ["Detachable workspace windows are not implemented yet. Terminal panes can already be split, resized, and maximized inside a workspace.", "Отдельные плавающие окна пространств пока не реализованы. Терминальные панели уже можно разделять, менять их размеры и разворачивать внутри пространства."],
  "remote-servers": ["The remote Voxiva server protocol is not implemented yet. SSH terminal connections are available in SSH hosts.", "Протокол удалённого сервера Voxiva пока не реализован. SSH-подключения в терминале доступны в разделе SSH-хосты."],
  plugins: ["Voxiva does not yet load third-party application plugins. Built-in integrations and CLI agents are configured in their own sections.", "Voxiva пока не загружает сторонние плагины приложения. Встроенные интеграции и CLI-агенты настраиваются в отдельных разделах."],
};

export function ExtendedSettingsSection({ section, onSection }: { section: SectionId; onSection: (id: SectionId) => void }) {
  const space = useSpace();
  const { setView } = useView();
  const { locale, t, activeWorkspace, workspaces, setError } = space;
  const ru = locale === "ru";
  const text = (en: string, russian: string) => ru ? russian : en;
  const [prefs, setPrefs] = useState(loadTerminalPrefs);
  const [status, setStatus] = useState(loadStatusBarPrefs);
  useEffect(() => subscribeTerminalPrefs(setPrefs), []);
  useEffect(() => subscribeStatusBarPrefs(setStatus), []);
  const patch = (value: Partial<TerminalPrefs>) => {
    const next = { ...prefs, ...value };
    try { saveTerminalPrefs(next); setPrefs(next); } catch (err) { setError(String(err)); }
  };
  const toggle = (key: "rightClickPaste" | "focusFollowsMouse" | "copyOnSelect" | "trimGutterOnCopy" | "allowOsc52" | "inlineImages", title: string, hint: string) => <div className="vs-terminalSettingRow" key={key}>
    <span><strong>{title}</strong><small>{hint}</small></span>
    <button type="button" role="switch" aria-checked={prefs[key]} aria-label={title} className={`vs-toggle${prefs[key] ? " is-on" : ""}`} onClick={() => patch({ [key]: !prefs[key] })}><i /></button>
  </div>;
  const link = (label: string, run: () => void, disabled = false) => <button type="button" className="vs-btn" disabled={disabled} onClick={run}>{label}<ArrowUpRight size={14} aria-hidden="true" /></button>;
  const run = (action: () => Promise<unknown>) => { void action().catch(err => setError(String(err))); };
  const missing = UNAVAILABLE[section];
  if (section === "ssh") return <SshSettings />;
  if (section === "provider-accounts") return <ProviderAccountsSettings />;
  if (section === "orchestration") return <OrchestrationSettings />;
  if (section === "voice") return <VoiceSettings />;
  if (section === "remote-servers") return <RemoteServersSettings onSection={onSection} locale={locale} />;
  return <section className={`vs-settingsPanelBody vs-settingsExtended is-section-${section}`}>
    {missing && <div className="vs-settingsAvailability" role="note"><Info size={18} aria-hidden="true" /><div><strong>{text("Not available in this build", "Недоступно в этой сборке")}</strong><p>{missing[ru ? 1 : 0]}</p></div></div>}
    {section === "computer-use" && <><p className="vs-settingsHint">{text("The embedded browser supports element inspection and sending page context to agents. Autonomous control of desktop applications is not connected yet.", "Встроенный браузер поддерживает выбор элементов и передачу контекста страницы агентам. Автономное управление настольными приложениями пока не подключено.")}</p>{link(text("Open browser", "Открыть браузер"), () => setView("browser"))}</>}
    {section === "integrations" && <><p className="vs-settingsHint">{text("Configure the integrations already used by this installation.", "Настройте интеграции, которые уже работают в этой установке.")}</p><div className="vs-settingsActionRow">{link(text("CLI agents", "CLI-агенты"), () => onSection("agents"))}{link(text("Browser sessions", "Сессии браузера"), () => onSection("browser"))}{link(text("Mobile companion", "Подключение телефона"), () => onSection("mobile"))}{link(text("Open project editor", "Открыть редактор проекта"), () => run(async () => { await space.openWorkspaceInVsCodeInline(activeWorkspace?.cwd || undefined); setView("space"); }), !activeWorkspace?.cwd)}</div></>}
    {section === "automations" && <><p className="vs-settingsHint">{text("The startup command runs when new terminal panes are created. Scheduled and background automations are not implemented yet.", "Команда запуска выполняется при создании новых терминальных панелей. Автоматизации по расписанию и фоновые задания пока не реализованы.")}</p><label className="vs-settingsField">{t("settings.termSetupCommand")}<input value={prefs.setupScriptCommand} onChange={e => patch({ setupScriptCommand: e.target.value })} placeholder="npm install" /></label><DropdownSelect label={t("settings.termSetupLocation")} value={prefs.setupScriptLocation} options={[{ value: "tab", label: t("settings.termSetupTab") }, { value: "vertical", label: t("settings.termSetupVertical") }, { value: "horizontal", label: t("settings.termSetupHorizontal") }]} onChange={value => { if (value === "tab" || value === "vertical" || value === "horizontal") patch({ setupScriptLocation: value }); }} /></>}
    {section === "artifacts" && <><p className="vs-settingsHint">{text("Project files can be opened and edited in the workspace editor. A separate artifact gallery, publishing, and artifact version history are not implemented yet.", "Файлы проекта можно открывать и редактировать в редакторе рабочего пространства. Отдельная галерея, публикация и история версий артефактов пока не реализованы.")}</p>{link(text("Open project files", "Открыть файлы проекта"), () => run(async () => { await space.openWorkspaceInVsCodeInline(activeWorkspace?.cwd || undefined); setView("space"); }), !activeWorkspace?.cwd)}</>}
    {section === "session-search" && <><p className="vs-settingsHint">{text("Search the locally recorded agent session history.", "Ищите по локальной истории сессий агентов.")}</p>{link(text("Open session history", "Открыть историю сессий"), () => setView("history"))}</>}
    {section === "git" && <><p className="vs-settingsHint">{text("Git works in the selected project directory. Status is read by the installed Git CLI; a separate graphical source control panel is not included yet.", "Git работает в каталоге выбранного проекта. Статус читается установленным Git CLI; отдельная графическая панель контроля версий пока не добавлена.")}</p><p className="vs-settingsHint">{activeWorkspace?.cwd || text("Select a project first.", "Сначала выберите проект.")}</p>{link(text("Show Git status", "Показать статус Git"), () => run(async () => { const id = await space.launchAgent({ title: "Git status", command: "git status --short --branch", accent: "green" }); if (id) setView("space"); }), !activeWorkspace?.cwd)}</>}
    {section === "task-sources" && <><p className="vs-settingsHint">{text("Tasks are stored locally for each workspace. External task tracker integrations are not connected yet.", "Задачи сохраняются локально для каждого пространства. Внешние трекеры задач пока не подключены.")}</p><p>{text("Workspaces", "Рабочие пространства")}: {workspaces.length}</p>{link(text("Open task board", "Открыть доску задач"), () => setView("board"))}</>}
    {section === "quick-commands" && <><p className="vs-settingsHint">{text("The command palette opens workspace, terminal, pane, and navigation actions. Its shortcuts can be changed in Shortcuts.", "Палитра команд открывает действия для пространств, терминалов, панелей и навигации. Сочетания можно изменить в разделе горячих клавиш.")}</p><div className="vs-settingsActionRow">{link(text("Open command palette", "Открыть палитру команд"), () => window.dispatchEvent(new Event("voxiva-command-palette-open")))}{link(text("Configure shortcuts", "Настроить горячие клавиши"), () => onSection("hotkeys"))}</div></>}
    {section === "input-editing" && <>
      <p className="vs-settingsHint">{t("settings.termInteractionHint")}</p>
      {([ ["rightClickPaste", "settings.termRightClick", "settings.termRightClickHint"], ["focusFollowsMouse", "settings.termFocusMouse", "settings.termFocusMouseHint"], ["copyOnSelect", "settings.termCopySelect", "settings.termCopySelectHint"], ["trimGutterOnCopy", "settings.termTrimGutter", "settings.termTrimGutterHint"] ] as const).map(([key, title, hint]) => toggle(key, t(title), t(hint)))}
      <label className="vs-settingsField">{t("settings.termWordSeparators")}<input value={prefs.wordSeparators} onChange={e => patch({ wordSeparators: e.target.value })} /></label>
    </>}
    {section === "stats-usage" && <>
      <p className="vs-settingsHint">{text("Choose what appears in the bottom status bar. Provider limits come from available local session data.", "Выберите показатели нижней строки состояния. Лимиты провайдеров читаются из доступных локальных данных сессий.")}</p>
      {([ ["usage", "status.usage"], ["awake", "status.awake"], ["resources", "status.resources"], ["sessions", "status.sessions"], ["ports", "status.ports"] ] as const).map(([key, label]) => <div className="vs-terminalSettingRow" key={key}><span><strong>{t(label)}</strong></span><button type="button" role="switch" aria-checked={status[key]} aria-label={t(label)} className={`vs-toggle${status[key] ? " is-on" : ""}`} onClick={() => { try { const next = { ...status, [key]: !status[key] }; saveStatusBarPrefs(next); setStatus(next); } catch (err) { setError(String(err)); } }}><i /></button></div>)}
      {link(text("Show usage", "Показать лимиты"), () => document.getElementById("status-usage")?.showPopover(), !status.usage)}
    </>}
    {section === "privacy" && <><p className="vs-settingsHint">{text("Workspace preferences and session history are stored locally. Browser sign-in data can be imported from your browsers in Browser settings. Phone access is controlled by Mobile pairing.", "Настройки пространств и история сессий сохраняются локально. Данные входа можно импортировать из ваших браузеров в настройках браузера. Доступ с телефона управляется подключением в разделе Телефон.")}</p>{toggle("allowOsc52", t("settings.termOsc52"), t("settings.termOsc52Hint"))}<div className="vs-settingsActionRow">{link(text("Browser data", "Данные браузера"), () => onSection("browser"))}{link(text("Phone access", "Доступ с телефона"), () => onSection("mobile"))}</div></>}
    {section === "advanced" && <><p className="vs-settingsHint">{t("settings.termAdvancedHint")}</p><label className="vs-settingsField">{t("settings.termScrollback")}<input type="number" min={1000} max={100000} step={1000} value={prefs.scrollbackRows} onChange={e => { const rows = Number(e.target.value); if (Number.isFinite(rows)) patch({ scrollbackRows: Math.min(100000, Math.max(1000, rows)) }); }} /></label><p className="vs-settingsHint">{t("settings.termNewPanesHint")}</p>{link(text("Terminal rendering settings", "Настройки рендеринга терминала"), () => onSection("terminal"))}</>}
    {section === "experimental" && <><p className="vs-settingsHint">{text("These controls are connected to the terminal renderer. New terminal panes use the updated settings.", "Эти параметры подключены к рендереру терминала. Новые терминальные панели используют обновлённые настройки.")}</p>{toggle("inlineImages", t("settings.termInlineImages"), t("settings.termInlineImagesHint"))}{toggle("allowOsc52", t("settings.termOsc52"), t("settings.termOsc52Hint"))}</>}
    {section === "projects" && <><p className="vs-settingsHint">{text("Manage project directories and their workspaces.", "Управляйте каталогами проектов и их рабочими пространствами.")}</p>{link(text("Open projects", "Открыть проекты"), () => setView("projects"))}</>}
    {(section === "plugins" || section === "share-skills") && link(text("Configure installed agents", "Настроить установленных агентов"), () => onSection("agents"))}
    {section === "floating-workspace" && link(text("Open workspace", "Открыть пространство"), () => setView("space"), !activeWorkspace)}
    {section === "mobile-emulator" && link(text("Open browser", "Открыть браузер"), () => setView("browser"))}
    {section === "account" && link(text("Agent accounts", "Аккаунты агентов"), () => onSection("provider-accounts"))}
  </section>;
}
