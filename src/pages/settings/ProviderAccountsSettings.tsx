import { useEffect, useState } from "react";
import { ArrowUpRight, ClipboardCopy, RefreshCw, Save, Trash2 } from "lucide-react";
import { AgentBrandIcon } from "@/components/agents/AgentBrandIcon";
import { agentBots, isBotReady, resolveBotLaunchCommand } from "@/features/agents/bots";
import { openUpdateUrl } from "@/features/updates/api";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { invoke } from "@/platform/desktop";

type Quota = { used: number; minutes: number; resetsAt: number };
type StatusSnapshot = { subscription: { provider: "codex"; plan: string } | null; limits: { at: number; windows: Quota[] } | null };
type SecretProvider = "opencode-go" | "minimax" | "glm";
type AccountState = Array<{ id: SecretProvider; saved: boolean }>;
type ProviderUsage = { id: string; modelCount?: number | null; windows?: Array<{ label: string; used: number }>; updatedAt: number };

export function ProviderAccountsSettings() {
  const space = useSpace();
  const { setView } = useView();
  const ru = space.locale === "ru";
  const text = (en: string, russian: string) => ru ? russian : en;
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<AccountState>([]);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [refreshingUsage, setRefreshingUsage] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, ProviderUsage>>({});

  const ready = (id: string) => {
    const bot = agentBots.find((item) => item.id === id);
    return Boolean(bot && isBotReady(bot, space.agentAvailability, space.agentsScanned));
  };
  const codexQuotas = snapshot?.limits?.windows.filter((quota) => quota.resetsAt > Date.now()) ?? [];
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      await space.refreshAgents();
      setSnapshot(await invoke<StatusSnapshot>("status_snapshot"));
      setAccounts(await invoke<AccountState>("provider_accounts_list"));
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    void invoke<StatusSnapshot>("status_snapshot").then(setSnapshot).catch(() => undefined);
    void invoke<AccountState>("provider_accounts_list").then(setAccounts).catch((cause) => setError(String(cause)));
  }, []);
  const saveSecret = async (id: SecretProvider) => {
    setSaving(id); setError("");
    try {
      await invoke("provider_account_save", { id, secret: secrets[id] });
      setSecrets((current) => ({ ...current, [id]: "" }));
      setAccounts(await invoke<AccountState>("provider_accounts_list"));
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(null); }
  };
  const removeSecret = async (id: SecretProvider) => {
    setSaving(id); setError("");
    try { await invoke("provider_account_remove", { id }); setAccounts(await invoke<AccountState>("provider_accounts_list")); }
    catch (cause) { setError(String(cause)); }
    finally { setSaving(null); }
  };
  const refreshUsage = async (id: SecretProvider) => {
    setRefreshingUsage(id); setError("");
    try { const result = await invoke<ProviderUsage>("provider_account_usage", { id }); setUsage((current) => ({ ...current, [id]: result })); }
    catch (cause) { setError(String(cause)); }
    finally { setRefreshingUsage(null); }
  };
  const credential = (id: SecretProvider, name: string, description: string, url: string) => {
    const saved = accounts.find((item) => item.id === id)?.saved ?? false;
    const liveUsage = usage[id];
    return <div className="vs-providerSection" key={id}>
      <div className="vs-providerTitle"><AgentBrandIcon id={id === "opencode-go" ? "opencode" : id === "glm" ? "zcode" : "mimo"} size={20} /><strong>{name}</strong><span className={`vs-providerState${saved ? " is-connected" : ""}`}>{saved ? text("Key saved securely", "Ключ сохранён защищённо") : text("Not connected", "Не подключено")}</span></div>
      <p>{description}</p>
      <label className="vs-providerKeyLabel">{text("API key", "API-ключ")}<input type="password" autoComplete="new-password" value={secrets[id] ?? ""} onChange={(event) => setSecrets((current) => ({ ...current, [id]: event.target.value }))} placeholder={saved ? text("Enter a new key to replace the saved one", "Введите новый ключ для замены сохранённого") : text("Paste API key", "Вставьте API-ключ")} /></label>
      <div className="vs-providerActions"><button type="button" className="vs-btn" disabled={saving === id || (secrets[id] ?? "").trim().length < 8} onClick={() => void saveSecret(id)}><Save size={14} aria-hidden="true" />{saving === id ? text("Saving…", "Сохранение…") : text("Save securely", "Сохранить защищённо")}</button>{saved && <button type="button" className="vs-btn" disabled={saving === id} onClick={() => void removeSecret(id)}><Trash2 size={14} aria-hidden="true" />{text("Forget key", "Удалить ключ")}</button>}{(id === "opencode-go" || id === "minimax") && <button type="button" className="vs-btn" disabled={!saved || refreshingUsage === id} onClick={() => void refreshUsage(id)}><RefreshCw size={14} aria-hidden="true" />{refreshingUsage === id ? text("Checking…", "Проверка…") : text("Refresh usage", "Обновить лимиты")}</button>}{docs(url, text("Get API key", "Получить API-ключ"))}</div>
      {liveUsage && <div className="vs-providerLiveUsage">{liveUsage.windows?.map((window) => <div className="vs-providerQuota" key={window.label}><div><strong>{window.label === "5h" ? text("5-hour window", "Окно 5 часов") : text("Weekly window", "Недельное окно")}</strong><span>{Math.round(window.used)}% {text("used", "использовано")}</span></div><i><b style={{ width: `${window.used}%` }} /></i></div>)}{liveUsage.modelCount != null && <p>{liveUsage.modelCount} {text("models available", "моделей доступно")}</p>}<small>{text("Updated", "Обновлено")} {new Date(liveUsage.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>}
      <p className="vs-providerNote">{text("Stored encrypted with Windows system protection. The key is never shown again or included in diagnostics. Usage is shown only when the provider exposes a supported usage source.", "Зашифрован средствами защиты Windows. Ключ больше не отображается и не попадает в диагностику. Лимиты появятся, только если у провайдера доступен поддерживаемый источник данных.")}</p>
    </div>;
  };
  const copy = async (command: string) => {
    try { await navigator.clipboard.writeText(command); setCopied(command); setError(""); }
    catch (cause) { setError(String(cause)); }
  };
  const openCli = async (id: string, command?: string) => {
    const bot = agentBots.find((item) => item.id === id);
    if (!bot || !space.activeWorkspace || !ready(id)) return;
    try {
      const sessionId = await space.launchAgent({ title: command ? `${bot.name} login` : bot.name, command: command ?? resolveBotLaunchCommand(bot, space.agentAvailability), shell: bot.shell, accent: bot.accent, agentId: command ? "shell" : bot.id, forceNew: Boolean(command) });
      if (sessionId) setView("space");
    } catch (cause) { setError(String(cause)); }
  };
  const docs = (url: string, label = text("Instructions", "Инструкция")) => <button type="button" className="vs-providerTextAction" onClick={() => void openUpdateUrl(url).catch((cause) => setError(String(cause)))}>{label}<ArrowUpRight size={13} aria-hidden="true" /></button>;
  const cli = (id: string, label: string, command?: string) => <button type="button" className="vs-btn" disabled={!space.activeWorkspace || !ready(id)} title={!space.activeWorkspace ? text("Select a workspace first", "Сначала выберите рабочее пространство") : undefined} onClick={() => void openCli(id, command)}>{label}</button>;

  return <section className="vs-settingsPanelBody vs-providerAccounts">
    <p className="vs-settingsHint">{text("Optional. Existing CLI logins remain in their own tools. Voxiva does not copy or expose their tokens.", "Необязательно. Существующие входы остаются в самих CLI. Voxiva не копирует и не показывает их токены.")}</p>
    <div className="vs-providerToolbar"><span>{text("Local environment: Windows", "Локальное окружение: Windows")}</span><button type="button" className="vs-btn" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} aria-hidden="true" />{busy ? text("Checking…", "Проверка…") : text("Refresh CLI status", "Обновить статус CLI")}</button></div>
    {error && <p className="vs-providerError" role="alert">{error}</p>}

    <div className="vs-settingsBlock vs-providerGroup">
      {([{
        id: "opencode", name: "OpenCode", command: "opencode auth login", url: "https://opencode.ai/docs/providers/",
        en: "Manage provider logins in OpenCode. New Voxiva sessions use its system-default credentials.", ru: "Управляйте входом в провайдеры через OpenCode. Новые сессии Voxiva используют его системный вход.",
      }, {
        id: "devin", name: "Devin", command: "", url: "https://docs.devin.ai/",
        en: "Devin credentials stay with its CLI. Voxiva does not manage separate Devin accounts yet.", ru: "Данные входа остаются в Devin CLI. Отдельными аккаунтами Devin Voxiva пока не управляет.",
      }] as const).map((provider) => <div className="vs-providerSection" key={provider.id}>
        <div className="vs-providerTitle"><AgentBrandIcon id={provider.id} size={20} /><strong>{provider.name}</strong><span className="vs-providerState">{ready(provider.id) ? text("CLI installed", "CLI установлен") : text("CLI not found", "CLI не найден")}</span></div>
        <p>{text(provider.en, provider.ru)}</p>
        {provider.command && <code>{provider.command}</code>}
        <div className="vs-providerActions">{provider.command && <button type="button" className="vs-btn" onClick={() => void copy(provider.command)}><ClipboardCopy size={14} aria-hidden="true" />{copied === provider.command ? text("Copied", "Скопировано") : text("Copy login command", "Скопировать команду входа")}</button>}{docs(provider.url)}{ready(provider.id) && cli(provider.id, text("Open CLI", "Открыть CLI"))}</div>
        <div className="vs-providerSystemRow"><span>{text("System default", "Системный аккаунт")}</span><small>{text("Used for new sessions", "Используется в новых сессиях")}</small></div>
      </div>)}

      <div className="vs-providerSection vs-providerLocation"><div><strong>{text("Account location", "Расположение аккаунтов")}</strong><p>{text("Voxiva currently launches local agents on Windows. WSL and remote credentials remain independent.", "Сейчас Voxiva запускает локальных агентов в Windows. Данные входа WSL и удалённых машин не смешиваются с ними.")}</p></div><span>Windows</span></div>

      {([{
        id: "claude", name: "Claude", url: "https://code.claude.com/docs/en/authentication", command: "claude",
        en: "Use the normal Claude CLI login. Opening the CLI does not create an isolated Voxiva account.", ru: "Используйте обычный вход Claude CLI. Открытие CLI не создаёт отдельный аккаунт Voxiva.",
      }, {
        id: "codex", name: "Codex", url: "https://developers.openai.com/codex/auth/", command: "codex login",
        en: "Use your existing Codex login. The plan below comes from local Codex session data, when available.", ru: "Используйте существующий вход Codex. Тариф ниже читается из локальных данных Codex, если они доступны.",
      }] as const).map((provider) => <div className="vs-providerSection" key={provider.id}>
        <div className="vs-providerTitle"><AgentBrandIcon id={provider.id} size={20} /><strong>{provider.name}</strong></div>
        <p>{text(provider.en, provider.ru)}</p>
        <div className="vs-providerActions">{cli(provider.id, text(provider.id === "codex" ? "Open login terminal" : "Open CLI", provider.id === "codex" ? "Открыть терминал входа" : "Открыть CLI"), provider.command)}{docs(provider.url)}</div>
        <div className="vs-providerAccountRow"><strong>{text("System default", "Системный аккаунт")}</strong><small>{provider.id === "codex" && snapshot?.subscription ? `${snapshot.subscription.plan.toUpperCase()} · ${text("local Codex plan", "локальный тариф Codex")}` : text("Authentication stays in the CLI", "Авторизация хранится в CLI")}</small></div>
        <p className="vs-providerNote">{text("Separate managed accounts are not supported in this build. Signing in here can change the CLI's system-default account.", "Отдельные управляемые аккаунты пока не поддерживаются. Вход здесь может изменить системный аккаунт CLI.")}</p>
      </div>)}

      <div className="vs-providerSection"><div className="vs-providerTitle"><AgentBrandIcon id="gemini" size={20} /><strong>Gemini CLI</strong></div><p>{text("Gemini CLI keeps its own sign-in. Voxiva does not extract OAuth credentials from it.", "Gemini CLI хранит свой вход самостоятельно. Voxiva не извлекает из него OAuth-данные.")}</p><div className="vs-providerActions">{cli("gemini", text("Open CLI", "Открыть CLI"))}{docs("https://github.com/google-gemini/gemini-cli")}</div></div>
      <div className="vs-providerSection"><div className="vs-providerTitle"><AgentBrandIcon id="antigravity" size={20} /><strong>Antigravity</strong></div><p>{text("Sign in with agy in its own terminal. Account switching is handled by the tool.", "Войдите через agy в его терминале. Переключением аккаунтов управляет сам инструмент.")}</p><div className="vs-providerActions">{cli("antigravity", text("Open CLI", "Открыть CLI"))}{docs("https://antigravity.google/")}</div></div>

      <div className="vs-providerSection vs-providerUsage">
        <div className="vs-providerTitle"><AgentBrandIcon id="codex" size={20} /><strong>{text("Codex usage", "Лимиты Codex")}</strong><span className="vs-providerState">{snapshot?.limits?.at ? `${text("Updated", "Обновлено")} ${new Date(snapshot.limits.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : text("No local usage data", "Нет локальных данных")}</span></div>
        {codexQuotas.length ? codexQuotas.map((quota) => <div className="vs-providerQuota" key={quota.minutes}><div><strong>{quota.minutes < 60 ? text("Session", "Сессия") : text("Weekly", "Неделя")}</strong><span>{Math.round(quota.used)}% · {text("resets", "сброс")} {new Date(quota.resetsAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span></div><i><b style={{ width: `${quota.used}%` }} /></i></div>) : <p>{text("Usage appears here when local Codex session data contains current limits. No token is sent to Voxiva.", "Здесь появятся лимиты, когда в локальных данных Codex будут текущие значения. Токены не отправляются в Voxiva.")}</p>}
      </div>
      {credential("opencode-go", "OpenCode Go", text("Save your OpenCode Go API key. Usage limits are managed by OpenCode and are not available through its public model endpoint.", "Сохраните API-ключ OpenCode Go. Лимиты управляются OpenCode и недоступны через публичный endpoint моделей."), "https://opencode.ai/docs/go/")}
      {credential("minimax", "MiniMax", text("Save a MiniMax API key for reference. Check current plan usage in the official console.", "Сохраните API-ключ MiniMax. Текущие лимиты тарифа смотрите в официальном кабинете."), "https://platform.minimax.io/")}
      <div className="vs-providerSection"><div className="vs-providerTitle"><AgentBrandIcon id="grok" size={20} /><strong>Grok (xAI)</strong></div><p>{text("Grok CLI keeps its own sign-in. Usage is not available from this local status source.", "Вход Grok хранится в CLI. Лимиты недоступны из локального источника статуса.")}</p><div className="vs-providerActions">{docs("https://console.x.ai/", text("Open provider site", "Открыть сайт провайдера"))}</div></div>
      <div className="vs-providerSection"><div className="vs-providerTitle"><AgentBrandIcon id="cursor-agent" size={20} /><strong>Cursor</strong></div><p>{text("Cursor keeps its own sign-in. Open the dashboard to view plan usage.", "Вход хранится в Cursor. Лимиты тарифа доступны в его кабинете.")}</p><div className="vs-providerActions">{docs("https://cursor.com/dashboard", text("Open dashboard", "Открыть кабинет"))}</div></div>
      {credential("glm", "GLM Coding Plan", text("Save a GLM Coding Plan API key. Check current quota in the Z.AI account console.", "Сохраните API-ключ GLM Coding Plan. Текущую квоту смотрите в кабинете Z.AI."), "https://z.ai/manage-apikey/apikey-list")}
    </div>
  </section>;
}
