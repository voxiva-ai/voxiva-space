import { ArrowRight, Cloud, Laptop, Server, Smartphone } from "lucide-react";
import type { SectionId } from "./navigation";

export function RemoteServersSettings({ onSection, locale }: { onSection: (id: SectionId) => void; locale: string }) {
  const ru = locale === "ru";
  const text = (en: string, russian: string) => ru ? russian : en;
  return <section className="vs-settingsPanelBody vs-settingsExtended vs-remoteServers">
    <div className="vs-remoteModes">
      <button type="button" className="vs-remoteMode is-active" onClick={() => onSection("ssh")}>
        <span className="vs-remoteModeIcon"><Laptop size={17} /></span>
        <span><strong>{text("Connect to a host", "Подключиться к хосту")}</strong><small>{text("Open an SSH terminal on another machine", "Открыть SSH-терминал на другом компьютере")}</small></span>
        <ArrowRight size={15} />
      </button>
      <button type="button" className="vs-remoteMode" onClick={() => onSection("mobile")}>
        <span className="vs-remoteModeIcon"><Smartphone size={17} /></span>
        <span><strong>{text("Share this host", "Подключить свои устройства")}</strong><small>{text("Pair a phone with this computer using Companion", "Подключить телефон к этому компьютеру через Companion")}</small></span>
        <ArrowRight size={15} />
      </button>
      <div className="vs-remoteMode is-disabled" aria-disabled="true">
        <span className="vs-remoteModeIcon"><Cloud size={17} /></span>
        <span><strong>{text("Cloud VM", "Облачная VM")}</strong><small>{text("Create and manage cloud machines", "Создание и управление облачными машинами")}</small></span>
        <span className="vs-remoteDevBadge">{text("In development", "В разработке")}</span>
      </div>
    </div>

    <div className="vs-remoteSectionHead">
      <div><strong>{text("Connect to a remote host", "Подключение к удалённому хосту")}</strong><p>{text("Save SSH targets, then open a terminal session from SSH Hosts.", "Сохраните SSH-хост и откройте терминал в разделе «SSH-хосты».")}</p></div>
      <button type="button" className="vs-btn" onClick={() => onSection("ssh")}><Server size={15} />{text("Open SSH Hosts", "Открыть SSH-хосты")}</button>
    </div>
    <div className="vs-remoteInfo">
      {text("SSH uses your system OpenSSH client and existing key or agent setup. Voxiva stores host address, port, and username locally.", "SSH использует системный OpenSSH и ваши ключи или ssh-agent. Voxiva хранит адрес, порт и имя пользователя локально.")}
    </div>

    <details className="vs-remoteHelp">
      <summary>{text("Connection help", "Помощь с подключением")}</summary>
      <div>
        <p>{text("For SSH, install OpenSSH Client, add a host in SSH Hosts, and make sure your key is accepted by the server. If you use an SSH config alias, import your ~/.ssh/config file there.", "Для SSH установите OpenSSH Client, добавьте хост в разделе «SSH-хосты» и убедитесь, что сервер принимает ваш ключ. Если вы используете псевдоним из SSH config, импортируйте файл ~/.ssh/config там же.")}</p>
        <p>{text("To share this computer with your phone, open Mobile, start pairing, and scan its QR code while both devices are on the same network.", "Чтобы подключить телефон к этому компьютеру, откройте раздел «Телефон», включите подключение и отсканируйте QR-код. Оба устройства должны быть в одной сети.")}</p>
      </div>
    </details>
  </section>;
}
