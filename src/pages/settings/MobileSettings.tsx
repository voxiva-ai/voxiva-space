import { useEffect, useState } from "react";
import { companionStart, companionStatus, companionStop, type CompanionStatus } from "@/features/companion/api";
import { loadCompanionToken } from "@/features/companion/pairing";
import { CompanionQrCode } from "@/features/companion/QrCode";
import { setCompanionLive } from "@/features/companion/live";
import { useSpace } from "@/features/workspace/SpaceContext";
import { openUrl } from "@/features/terminal/api";

export function MobileSettings() {
  const { locale, activeWorkspace, setError } = useSpace();
  const ru = locale === "ru";
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => { void companionStatus().then(value => { if (active) { setStatus(value); setFailed(false); } }).catch(() => { if (active) setFailed(true); }); };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const change = async () => {
    if (!status || busy) return;
    setBusy(true);
    try {
      const next = status.running ? await companionStop() : await companionStart(loadCompanionToken(), activeWorkspace?.id);
      setStatus(next);
      setCompanionLive(next.running);
      setCopied(false);
      window.dispatchEvent(new Event("voxiva-companion-changed"));
    } catch (err) { setError(String(err)); } finally { setBusy(false); }
  };
  return <section className="vs-settingsPanelBody vs-settingsExtended">
    <p className="vs-settingsHint">{ru ? "Подключите Voxiva Companion в одной локальной сети с компьютером. QR-код даёт доступ к пространствам и терминалам: показывайте его только своим устройствам." : "Connect Voxiva Companion on the same local network as this computer. The QR code grants access to workspaces and terminals; share it only with your devices."}</p>
    <div className="vs-terminalSettingRow"><span><strong>{ru ? "Подключение телефона" : "Phone connection"}</strong><small role="status">{failed ? (ru ? "Не удалось получить состояние подключения" : "Could not read connection status") : !status ? (ru ? "Проверка…" : "Checking…") : status.paired ? (ru ? "Телефон подключён" : "Phone paired") : status.running ? (ru ? "Ожидание подключения" : "Waiting for phone") : (ru ? "Выключено" : "Off")}</small></span><button type="button" role="switch" aria-checked={Boolean(status?.running)} aria-label={ru ? "Подключение телефона" : "Phone connection"} disabled={!status || busy} className={`vs-toggle${status?.running ? " is-on" : ""}`} onClick={() => void change()}><i /></button></div>
    {status?.running && status.pairUrl && <div className="vs-companionCard"><div className="vs-companionMeta"><strong>{ru ? "Отсканируйте QR-код в Companion" : "Scan the QR code in Companion"}</strong><p>{status.lanIp ?? "127.0.0.1"}:{status.port}</p><button type="button" className="vs-btn" onClick={() => { void navigator.clipboard.writeText(status.pairUrl!).then(() => setCopied(true)).catch(err => setError(String(err))); }}>{copied ? (ru ? "Ссылка скопирована" : "Link copied") : (ru ? "Скопировать ссылку подключения" : "Copy pairing link")}</button></div><CompanionQrCode value={status.pairUrl} label={ru ? "QR-код подключения телефона" : "Phone pairing QR code"} /></div>}
    {status?.installPageUrl && <button type="button" className="vs-btn" onClick={() => { void openUrl(status.installPageUrl!).catch(err => setError(String(err))); }}>{ru ? "Скачать Companion" : "Download Companion"}</button>}
  </section>;
}
