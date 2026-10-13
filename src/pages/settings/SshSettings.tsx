import { useEffect, useState } from "react";
import { Server, Trash2 } from "lucide-react";
import { useSpace, useView } from "@/features/workspace/SpaceContext";
import { checkCommands } from "@/features/terminal/api";

type Host = { id: string; name: string; host: string; user: string; port: number };
const KEY = "voxiva-ssh-hosts-v1";
function validHost(value: Host) {
  return typeof value?.name === "string" && value.name.trim().length > 0 && value.name.length <= 100
    && typeof value.host === "string" && /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])$/i.test(value.host)
    && typeof value.user === "string" && (!value.user || /^[a-z_][a-z0-9_.-]*$/i.test(value.user))
    && Number.isInteger(value.port) && value.port >= 1 && value.port <= 65535;
}
function loadHosts(): Host[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(values) ? values.filter((value): value is Host => typeof value?.id === "string" && validHost(value)).slice(0, 100) : [];
  } catch { return []; }
}

export function SshSettings() {
  const { locale, activeWorkspace, launchAgent, setError } = useSpace();
  const { setView } = useView();
  const ru = locale === "ru";
  const [hosts, setHosts] = useState(loadHosts);
  const [draft, setDraft] = useState({ name: "", host: "", user: "", port: "22" });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void checkCommands(["ssh"]).then(value => { if (active) setAvailable(Boolean(value.ssh)); }).catch(() => { if (active) setAvailable(false); }); return () => { active = false; }; }, []);
  const save = (next: Host[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); setHosts(next); return true; }
    catch (err) { setError(String(err)); return false; }
  };
  const connect = async (host: Host) => {
    if (!validHost(host) || !available || !activeWorkspace || busy) return;
    setBusy(true);
    try {
      const id = await launchAgent({ title: host.name, command: `ssh -p ${host.port} ${host.user ? host.user + "@" : ""}${host.host}`, accent: "blue", mode: "tab" });
      if (id) setView("space");
    } catch (err) { setError(String(err)); } finally { setBusy(false); }
  };
  return <section className="vs-settingsPanelBody vs-settingsExtended">
    <p className="vs-settingsHint">{ru ? "Подключайтесь через установленный OpenSSH. Пароли и ключи запрашиваются самим SSH в терминале и не сохраняются в настройках." : "Connect using the installed OpenSSH client. SSH requests passwords and keys in the terminal; these settings do not store them."}</p>
    <p className="vs-settingsHint" role="status">{available === null ? (ru ? "Проверка OpenSSH…" : "Checking OpenSSH…") : available ? (ru ? "OpenSSH установлен" : "OpenSSH installed") : (ru ? "OpenSSH не найден. Установите SSH-клиент, затем откройте этот раздел заново." : "OpenSSH was not found. Install an SSH client, then reopen this section.")}</p>
    <form className="vs-settingsHostForm" onSubmit={event => {
      event.preventDefault();
      const value = { id: crypto.randomUUID(), name: draft.name.trim(), host: draft.host.trim(), user: draft.user.trim(), port: Number(draft.port) };
      if (!validHost(value)) { setFormError(ru ? "Введите название, корректный адрес, имя пользователя без пробелов и порт от 1 до 65535." : "Enter a name, a valid host, a username without spaces, and a port from 1 to 65535."); return; }
      if (hosts.length >= 100) { setFormError(ru ? "Можно сохранить не более 100 хостов." : "You can save up to 100 hosts."); return; }
      if (save([...hosts, value])) { setDraft({ name: "", host: "", user: "", port: "22" }); setFormError(""); }
    }}>
      <label>{ru ? "Название" : "Name"}<input data-ssh-field="name" required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Production" /></label>
      <label>{ru ? "Адрес хоста" : "Host address"}<input data-ssh-field="host" required maxLength={253} value={draft.host} onChange={e => setDraft({ ...draft, host: e.target.value })} placeholder="server.example.com" /></label>
      <label>{ru ? "Пользователь (необязательно)" : "Username (optional)"}<input data-ssh-field="user" maxLength={64} value={draft.user} onChange={e => setDraft({ ...draft, user: e.target.value })} placeholder="developer" /></label>
      <label>{ru ? "Порт" : "Port"}<input data-ssh-field="port" required type="number" min={1} max={65535} value={draft.port} onChange={e => setDraft({ ...draft, port: e.target.value })} /></label>
      {error && <p className="vs-settingsFormError" role="alert">{error}</p>}
      <button type="submit" className="vs-btn">{ru ? "Добавить хост" : "Add host"}</button>
    </form>
    <div className="vs-settingsConnectionList">{hosts.map(host => <article key={host.id}>
      <Server size={18} aria-hidden="true" /><div><strong>{host.name}</strong><small>{host.user ? host.user + "@" : ""}{host.host}:{host.port}</small></div>
      <button type="button" className="vs-btn" disabled={!available || !activeWorkspace || busy} onClick={() => void connect(host)}>{ru ? "Подключиться" : "Connect"}</button>
      <button type="button" className="vs-iconBtn" aria-label={`${ru ? "Удалить" : "Remove"} ${host.name}`} onClick={() => save(hosts.filter(value => value.id !== host.id))}><Trash2 size={15} /></button>
    </article>)}</div>
    {!activeWorkspace && <p className="vs-settingsHint">{ru ? "Выберите рабочее пространство, чтобы открыть SSH-терминал." : "Select a workspace to open an SSH terminal."}</p>}
  </section>;
}
