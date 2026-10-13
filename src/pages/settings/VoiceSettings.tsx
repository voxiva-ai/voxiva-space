import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { DropdownSelect } from "@/components/DropdownSelect";

type VoicePrefs = { enabled: boolean; mode: "toggle" | "hold"; microphone: string; model: string };
const KEY = "voxiva-voice-prefs-v1";
const DEFAULTS: VoicePrefs = { enabled: false, mode: "hold", microphone: "default", model: "voxiva-voice" };
const MODELS = [
  { id: "voxiva-voice", name: "Voxiva Voice", note: "On-device speech engine is not included in this build.", state: "Not available yet" },
  { id: "parakeet-v3", name: "Parakeet TDT v3", note: "Local model · 25 European languages", state: "Not installed" },
  { id: "parakeet-v2", name: "Parakeet TDT v2", note: "Local model · English", state: "Not installed" },
  { id: "whisper-tiny", name: "Whisper Tiny", note: "Local model · broad language coverage", state: "Not installed" },
  { id: "gpt4o-mini", name: "GPT-4o mini Transcribe", note: "Cloud transcription · requires an OpenAI API key", state: "Not configured" },
];

function loadPrefs(): VoicePrefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEFAULTS; }
}

export function VoiceSettings() {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [permission, setPermission] = useState(false);
  const [error, setError] = useState("");
  const ru = document.documentElement.lang.toLowerCase().startsWith("ru");
  const text = (en: string, russian: string) => ru ? russian : en;
  const update = (patch: Partial<VoicePrefs>) => setPrefs(current => {
    const next = { ...current, ...patch };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  });

  const refreshDevices = async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) { setError(text("Microphone access is unavailable in this environment.", "Доступ к микрофону недоступен в этой среде.")); return; }
    try {
      if (requestPermission) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setPermission(true);
      }
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === "audioinput");
      setDevices(inputs);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };

  useEffect(() => { void refreshDevices(); }, []);
  useEffect(() => {
    const changed = () => { void refreshDevices(); };
    navigator.mediaDevices?.addEventListener?.("devicechange", changed);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", changed);
  }, []);

  const micOptions = [
    { value: "default", label: text("System default", "Системный микрофон") },
    ...devices.filter(device => device.deviceId && device.deviceId !== "default").map((device, index) => ({ value: device.deviceId, label: device.label || text(`Microphone ${index + 1}`, `Микрофон ${index + 1}`) })),
  ];
  const selectedModel = MODELS.find(model => model.id === prefs.model) ?? MODELS[0];
  const selectedMic = micOptions.find(option => option.value === prefs.microphone) ? prefs.microphone : "default";

  return <section className="vs-settingsPanelBody vs-voiceSettings">
    <p className="vs-settingsHint">{text("Local speech-to-text dictation with on-device models.", "Диктовка с локальным распознаванием речи на устройстве.")}</p>
    <div className="vs-soundCard vs-voiceCard">
      <div className="vs-terminalSettingRow">
        <span><strong>{text("Enable voice dictation", "Включить голосовой ввод")}</strong><small>{text("Dictation shortcut: Ctrl+E. Speech recognition is not available until a model is installed.", "Сочетание для диктовки: Ctrl+E. Распознавание заработает после установки модели.")}</small></span>
        <button type="button" role="switch" aria-checked={prefs.enabled} aria-label={text("Enable voice dictation", "Включить голосовой ввод")} className={`vs-toggle${prefs.enabled ? " is-on" : ""}`} onClick={() => update({ enabled: !prefs.enabled })}><i /></button>
      </div>
      <div className="vs-terminalSettingRow">
        <span><strong>{text("Dictation mode", "Режим диктовки")}</strong><small>{text("Toggle starts and stops with Ctrl+E; Hold records only while the shortcut is pressed.", "Переключатель: Ctrl+E запускает и останавливает запись. Удержание: запись только пока нажата клавиша.")}</small></span>
        <div className="vs-agentPermissionChoices" role="group" aria-label={text("Dictation mode", "Режим диктовки")}>
          {(["toggle", "hold"] as const).map(mode => <button key={mode} type="button" aria-pressed={prefs.mode === mode} className={prefs.mode === mode ? "is-active" : ""} onClick={() => update({ mode })}>{mode === "toggle" ? text("Toggle", "Переключатель") : text("Hold", "Удержание")}</button>)}
        </div>
      </div>
      <div className="vs-terminalSettingRow">
        <span><strong>{text("Microphone", "Микрофон")}</strong><small>{text("Input device used for voice dictation. System default follows your OS setting.", "Устройство для голосового ввода. Системный вариант следует настройкам ОС.")}</small></span>
        <div className="vs-voiceMicControl">
          <DropdownSelect label={text("Microphone", "Микрофон")} value={selectedMic} options={micOptions} onChange={microphone => update({ microphone })} />
          {!permission && <button type="button" className="vs-btn vs-btnGhost" onClick={() => void refreshDevices(true)}>{text("Allow", "Разрешить")}</button>}
        </div>
      </div>
      <div className="vs-terminalSettingRow vs-voiceModelRow">
        <span><strong>{text("Speech model", "Модель распознавания")}</strong><small>{text("Choose a model. Local models work offline; cloud models need an API key.", "Выберите модель. Локальные работают без интернета, облачным нужен API-ключ.")}</small></span>
        <DropdownSelect label={text("Speech model", "Модель распознавания")} value={selectedModel.id} options={MODELS.map(model => ({ value: model.id, label: model.name }))} onChange={model => update({ model })} className="vs-voiceModelSelect" />
      </div>
    </div>
    <div className="vs-voiceModelDetails" aria-live="polite">
      <span className="vs-voiceModelIcon"><Sparkles size={16} aria-hidden="true" /></span>
      <div><strong>{selectedModel.name} <small>{selectedModel.state}</small></strong><p>{selectedModel.note}</p></div>
    </div>
    {error && <p className="vs-settingsHint vs-voiceError" role="status">{error}</p>}
  </section>;
}
