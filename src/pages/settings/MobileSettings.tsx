import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, QrCode, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { companionStart, companionStatus, companionStop, type CompanionStatus } from "@/features/companion/api";
import { loadCompanionToken, rotateCompanionToken } from "@/features/companion/pairing";
import { CompanionQrCode } from "@/features/companion/QrCode";
import { setCompanionLive } from "@/features/companion/live";
import { loadCompanionPrefs, saveCompanionPrefs, type CompanionPrefs } from "@/features/companion/prefs";
import { useSpace } from "@/features/workspace/SpaceContext";
import { openUrl } from "@/features/terminal/api";

export function MobileSettings() {
  const { locale, activeWorkspace, setError } = useSpace();
  const ru = locale === "ru";
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [prefs, setPrefs] = useState<CompanionPrefs>(loadCompanionPrefs);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void companionStatus().then(value => {
        if (active) {
          setStatus(value);
          setFailed(false);
        }
      }).catch(() => { if (active) setFailed(true); });
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  const pairingUrl = useMemo(() => {
    if (!status?.running || !status.token || !status.lanIp) return null;
    const query = new URLSearchParams({
      t: status.token,
      h: status.lanIp,
      p: String(status.port),
      n: prefs.machineName.trim() || status.machineName || "Voxiva Space",
    });
    return `voxiva-space://pair?${query.toString()}`;
  }, [prefs.machineName, status]);

  function updatePrefs(next: CompanionPrefs) {
    const saved = saveCompanionPrefs(next);
    setPrefs(saved);
  }

  async function changeConnection() {
    if (!status || busy) return;
    setBusy(true);
    try {
      const next = status.running
        ? await companionStop()
        : await companionStart(loadCompanionToken(), activeWorkspace?.id);
      setStatus(next);
      setCompanionLive(next.running);
      setShowQr(false);
      setCopied(false);
      window.dispatchEvent(new Event("voxiva-companion-changed"));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokePairing() {
    if (!status || busy) return;
    setBusy(true);
    try {
      const wasRunning = status.running;
      await companionStop();
      rotateCompanionToken();
      const next = wasRunning
        ? await companionStart(loadCompanionToken(), activeWorkspace?.id)
        : await companionStatus();
      setStatus(next);
      setCompanionLive(next.running);
      setShowQr(wasRunning);
      setCopied(false);
      window.dispatchEvent(new Event("voxiva-companion-changed"));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyPairingUrl() {
    if (!pairingUrl) return;
    try {
      await navigator.clipboard.writeText(pairingUrl);
      setCopied(true);
    } catch (err) {
      setError(String(err));
    }
  }

  const statusLabel = failed
    ? (ru ? "Не удалось получить состояние" : "Couldn't read connection status")
    : !status
      ? (ru ? "Проверка…" : "Checking…")
      : status.running
        ? status.paired ? (ru ? "Телефон подключён" : "Phone paired") : (ru ? "Ожидание телефона" : "Waiting for phone")
        : (ru ? "Отключено" : "Off");

  return (
    <section className="vs-settingsPanelBody vs-settingsExtended vs-mobileSettings">
      <header className="vs-mobileIntro">
        <div className="vs-mobileTitleRow">
          <h2>Voxiva Mobile</h2>
          <span className="vs-mobileBeta">Beta</span>
        </div>
        <p>{ru ? "Открывайте пространства, задачи и терминалы Voxiva Space с телефона." : "Open your Voxiva Space workspaces, tasks, and terminals from your phone."}</p>
        <div className="vs-mobileDownloads">
          {status?.installPageUrl && <button type="button" className="vs-btn" onClick={() => { void openUrl(status.installPageUrl!).catch(err => setError(String(err))); }}><Download size={14} />{ru ? "Android APK" : "Android APK"}<span>{ru ? "Скачать" : "Download"}</span></button>}
          <span className="vs-mobileAvailability">{ru ? "iOS: публикация в App Store ещё не настроена" : "iOS: App Store release is not published yet"}</span>
        </div>
      </header>

      <article className="vs-mobileCard">
        <div className="vs-mobileSectionHead">
          <div className="vs-mobileSectionIcon"><Smartphone size={17} /></div>
          <div><h3>{ru ? "Этот компьютер" : "This computer"}</h3><p>{ru ? "Имя будет видно в мобильном приложении." : "This name appears in the mobile app after pairing."}</p></div>
        </div>
        <label className="vs-mobileField">
          <span>{ru ? "Имя компьютера" : "Machine name"}</span>
          <input
            value={prefs.machineName}
            maxLength={48}
            placeholder={status?.machineName || (ru ? "Имя этого компьютера" : "This computer's name")}
            onChange={event => updatePrefs({ ...prefs, machineName: event.target.value })}
          />
        </label>
        <label className="vs-mobileToggleRow">
          <span><strong>{ru ? "Показывать кнопку Mobile в боковой панели" : "Show Mobile button in the sidebar"}</strong><small>{ru ? "Быстрый переход к QR-подключению." : "Quick access to pairing settings."}</small></span>
          <button type="button" role="switch" aria-checked={prefs.showSidebarButton} aria-label={ru ? "Кнопка Mobile в боковой панели" : "Mobile sidebar button"} className={`vs-toggle${prefs.showSidebarButton ? " is-on" : ""}`} onClick={() => updatePrefs({ ...prefs, showSidebarButton: !prefs.showSidebarButton })}><i /></button>
        </label>
      </article>

      <article className="vs-mobileCard">
        <div className="vs-mobileSectionHead">
          <div className="vs-mobileSectionIcon"><Wifi size={17} /></div>
          <div><h3>{ru ? "Подключение по локальной сети" : "Local network connection"}</h3><p>{ru ? "Телефон и компьютер должны быть в одной Wi‑Fi сети или Tailscale." : "Keep your phone and computer on the same Wi‑Fi or Tailscale network."}</p></div>
        </div>
        <div className="vs-mobileStatusRow">
          <div><strong>{ru ? "LAN" : "LAN"}<span className={`vs-mobileStatusDot${status?.running ? " is-on" : ""}`} /></strong><small role="status">{failed ? statusLabel : status?.running ? `${statusLabel} · ${status.lanIp || (ru ? "IP недоступен" : "IP unavailable")}` : statusLabel}</small></div>
          <button type="button" role="switch" aria-checked={Boolean(status?.running)} aria-label={ru ? "Подключение к телефону" : "Phone connection"} disabled={!status || busy} className={`vs-toggle${status?.running ? " is-on" : ""}`} onClick={() => void changeConnection()}><i /></button>
        </div>
        <div className="vs-mobileActions">
          <button type="button" className="vs-btn" disabled={!status?.running || busy || !status.lanIp} onClick={() => setShowQr(value => !value)}><QrCode size={14} />{showQr ? (ru ? "Скрыть QR" : "Hide QR") : (ru ? "Сгенерировать QR-код" : "Generate QR code")}</button>
          {status?.running && status.pairUrl && <span className="vs-mobilePort">{status.lanIp || "—"}:{status.port}</span>}
        </div>
        {status?.running && !status.lanIp && <p className="vs-mobileWarning" role="status">{ru ? "Не удалось определить адрес локальной сети. Проверьте подключение Wi‑Fi и брандмауэр." : "No local network address was found. Check Wi-Fi and firewall settings."}</p>}
        {showQr && pairingUrl && <div className="vs-mobileQrCard"><div className="vs-mobileQrCopy"><strong>{ru ? "Откройте Voxiva Mobile и отсканируйте код" : "Open Voxiva Mobile and scan this code"}</strong><p>{ru ? "Доступ к терминалам и пространствам получит только отсканировавшее устройство." : "Only devices that scan this code receive access to workspaces and terminals."}</p><button type="button" className="vs-btn" onClick={() => void copyPairingUrl()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? (ru ? "Ссылка скопирована" : "Link copied") : (ru ? "Скопировать ссылку" : "Copy pairing link")}</button></div><CompanionQrCode value={pairingUrl} label={ru ? "QR-код подключения Voxiva Mobile" : "Voxiva Mobile pairing QR code"} /></div>}
        {status?.running && !showQr && <p className="vs-mobileFootnote">{ru ? "Сервер работает только пока включено это подключение. QR-код содержит секрет доступа — не отправляйте его другим." : "The server runs only while this connection is enabled. The QR contains an access secret; don't share it."}</p>}
      </article>

      <article className="vs-mobileCard">
        <div className="vs-mobileSectionHead">
          <div className="vs-mobileSectionIcon"><Check size={17} /></div>
          <div><h3>{ru ? "Подключённые устройства" : "Paired devices"}</h3><p>{ru ? "Pairing сейчас использует общий ключ для этого компьютера." : "Pairing currently uses one shared key for this computer."}</p></div>
        </div>
        {status?.paired ? (
          <div className="vs-mobileDeviceRow"><span><strong>{ru ? "Одно или несколько устройств" : "One or more devices"}</strong><small>{ru ? "Подключено к этому компьютеру" : "Paired with this computer"}</small></span><span className="vs-mobilePaired">{ru ? "Подключено" : "Paired"}</span></div>
        ) : <p className="vs-mobileEmpty">{ru ? "Пока нет подключённых устройств." : "No devices are paired yet."}</p>}
        <div className="vs-mobileActions">
          <button type="button" className="vs-btn" disabled={!status?.paired || busy} onClick={() => void revokePairing()}><RefreshCw size={14} />{ru ? "Отключить все устройства и обновить QR" : "Disconnect all and rotate pairing QR"}</button>
        </div>
        <p className="vs-mobileFootnote">{ru ? "Сброс немедленно отзовёт общий ключ у всех устройств и потребует отсканировать новый QR. Отзыв по одному устройству пока не поддерживается." : "Reset immediately revokes the shared key for all devices; scan a new QR to reconnect. Per-device revocation isn't supported yet."}</p>
      </article>
    </section>
  );
}
