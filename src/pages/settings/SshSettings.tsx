import { useEffect, useRef, useState } from "react";
import { Plus, Server, Trash2, Upload } from "lucide-react";
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

function parseSshConfig(config: string): Omit<Host, "id">[] {
  const entries = new Map<string, Omit<Host, "id">>();
  let aliases: string[] = [];
  let options = { host: "", user: "", port: 22 };
  const save = () => {
    for (const alias of aliases) {
      const value = { name: alias, host: options.host || alias, user: options.user, port: options.port };
      if (validHost({ ...value, id: "import" })) entries.set(alias.toLowerCase(), value);
    }
  };
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const match = line.match(/^(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(["'])(.*)\1$/, "$2").trim();
    if (key.toLowerCase() === "host") {
      save();
      aliases = value.split(/\s+/).filter(alias => !/[*?!]/.test(alias));
      options = { host: "", user: "", port: 22 };
    } else if (aliases.length && key.toLowerCase() === "hostname") options.host = value;
    else if (aliases.length && key.toLowerCase() === "user") options.user = value;
    else if (aliases.length && key.toLowerCase() === "port" && /^\d+$/.test(value)) options.port = Number(value);
  }
  save();
  return [...entries.values()];
}

export function SshSettings() {
  const { locale, activeWorkspace, launchAgent, setError } = useSpace();
  const { setView } = useView();
  const ru = locale === "ru";
  const importFile = useRef<HTMLInputElement>(null);
  const [hosts, setHosts] = useState(loadHosts);
  const [draft, setDraft] = useState({ name: "", host: "", user: "", port: "22" });
  const [available, setAvailable] = useState<boolean | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    void checkCommands(["ssh"]).then(value => { if (active) setAvailable(Boolean(value.ssh)); }).catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);

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

  return <section className="vs-settingsPanelBody vs-settingsExtended vs-sshSettings">
    <div className="vs-sshCard">
      <header className="vs-sshCardHead">
        <div><strong>{ru ? "Цели" : "Targets"}</strong><p>{ru ? "Добавьте удалённый хост для подключения." : "Add a remote host to connect to it."}</p></div>
        <div className="vs-sshActions">
          <input ref={importFile} type="file" accept=".ssh,.conf,.config,text/plain,*/*" hidden onChange={async event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            try {
              const imported = parseSshConfig(await file.text());
              if (!imported.length) { setFormError(ru ? "В файле не найдено SSH-целей." : "No SSH targets found in this file."); return; }
              const known = new Set(hosts.map(host => host.name.toLowerCase()));
              const added = imported.filter(host => !known.has(host.name.toLowerCase())).map(host => ({ ...host, id: crypto.randomUUID() }));
              if (hosts.length + added.length > 100) { setFormError(ru ? "Можно сохранить не более 100 хостов." : "You can save up to 100 hosts."); return; }
              if (save([...hosts, ...added])) setFormError(added.length ? "" : (ru ? "Все хосты из файла уже добавлены." : "All hosts in this file are already added."));
            } catch (err) { setFormError(ru ? `Не удалось прочитать SSH config: ${String(err)}` : `Could not read SSH config: ${String(err)}`); }
          }} />
          <button type="button" className="vs-sshActionButton" onClick={() => importFile.current?.click()}><Upload size={14} />{ru ? "Импорт" : "Import"}</button>
          <button type="button" data-ssh-add-target className="vs-sshActionButton is-primary" onClick={() => { setEditing(true); setFormError(""); }}><Plus size={14} />{ru ? "Добавить цель" : "Add Target"}</button>
        </div>
      </header>

      {formError && <p className="vs-sshFeedback" role="alert">{formError}</p>}
      {!hosts.length && !editing && <div className="vs-sshEmpty">{ru ? "Цели SSH ещё не добавлены." : "No SSH targets configured."}</div>}
      {!!hosts.length && <div className="vs-settingsConnectionList vs-sshTargets">{hosts.map(host => <article key={host.id}>
        <Server size={17} aria-hidden="true" />
        <div><strong>{host.name}</strong><small>{host.user ? host.user + "@" : ""}{host.host}:{host.port}</small></div>
        <button type="button" className="vs-sshActionButton is-primary" disabled={!available || !activeWorkspace || busy} onClick={() => void connect(host)}>{ru ? "Подключиться" : "Connect"}</button>
        <button type="button" className="vs-iconBtn vs-sshRemove" aria-label={`${ru ? "Удалить" : "Remove"} ${host.name}`} onClick={() => save(hosts.filter(value => value.id !== host.id))}><Trash2 size={15} /></button>
      </article>)}</div>}

      {editing && <form className="vs-settingsHostForm vs-sshForm" data-ssh-form onSubmit={event => {
        event.preventDefault();
        const value = { id: crypto.randomUUID(), name: draft.name.trim(), host: draft.host.trim(), user: draft.user.trim(), port: Number(draft.port) };
        if (!validHost(value)) { setFormError(ru ? "Введите название, адрес, имя пользователя без пробелов и порт от 1 до 65535." : "Enter a name, valid host, username without spaces, and a port from 1 to 65535."); return; }
        if (hosts.length >= 100) { setFormError(ru ? "Можно сохранить не более 100 хостов." : "You can save up to 100 hosts."); return; }
        if (save([...hosts, value])) { setDraft({ name: "", host: "", user: "", port: "22" }); setFormError(""); setEditing(false); }
      }}>
        <label>{ru ? "Название" : "Name"}<input data-ssh-field="name" required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Production" /></label>
        <label>{ru ? "Адрес хоста" : "Host address"}<input data-ssh-field="host" required maxLength={253} value={draft.host} onChange={e => setDraft({ ...draft, host: e.target.value })} placeholder="server.example.com" /></label>
        <label>{ru ? "Пользователь (необязательно)" : "Username (optional)"}<input data-ssh-field="user" maxLength={64} value={draft.user} onChange={e => setDraft({ ...draft, user: e.target.value })} placeholder="developer" /></label>
        <label>{ru ? "Порт" : "Port"}<input data-ssh-field="port" required type="number" min={1} max={65535} value={draft.port} onChange={e => setDraft({ ...draft, port: e.target.value })} /></label>
        <div className="vs-sshFormActions"><button type="button" className="vs-sshActionButton" onClick={() => { setEditing(false); setFormError(""); }}>{ru ? "Отмена" : "Cancel"}</button><button type="submit" className="vs-sshActionButton is-primary">{ru ? "Сохранить цель" : "Save Target"}</button></div>
      </form>}
      {!activeWorkspace && <p className="vs-settingsHint vs-sshNote">{ru ? "Выберите рабочее пространство, чтобы открыть SSH-терминал." : "Select a workspace to open an SSH terminal."}</p>}
      <p className="vs-sshNote" role="status">{available === null ? (ru ? "Проверка OpenSSH…" : "Checking OpenSSH…") : available ? "OpenSSH installed" : (ru ? "OpenSSH не найден. Установите SSH-клиент, чтобы подключаться к хостам." : "OpenSSH was not found. Install an SSH client to connect to hosts.")}</p>
    </div>
  </section>;
}
