import { AlarmClock, Bell, BookOpen, Bot, ChartNoAxesCombined, Command, FlaskConical, FolderGit2, GitBranch, Globe, History, Info, KeyRound, ListTodo, Mic, MonitorSmartphone, MousePointer2, Network, PanelsTopLeft, Palette, Plug, Puzzle, Server, Shapes, ShieldCheck, SlidersHorizontal, Smartphone, SquareTerminal, TextCursorInput, UserRound, Volume2, Workflow, Wrench, Keyboard } from "lucide-react";

export const SETTINGS_GROUPS = [
  { en: "AI capabilities", ru: "Возможности ИИ", items: [
    { id: "agents", en: "Agents", ru: "Агенты", icon: Bot },
    { id: "provider-accounts", en: "AI provider accounts", ru: "Аккаунты провайдеров ИИ", icon: KeyRound, badge: "optional" },
    { id: "orchestration", en: "Orchestration", ru: "Оркестрация", icon: Workflow },
    { id: "computer-use", en: "Computer Use", ru: "Управление компьютером", icon: MousePointer2 },
    { id: "voice", en: "Voice", ru: "Голос", icon: Mic },
  ] },
  { en: "Set up", ru: "Настройка", items: [
    { id: "account", en: "Voxiva account", ru: "Аккаунт Voxiva", icon: UserRound },
    { id: "general", en: "General", ru: "Основные", icon: SlidersHorizontal },
    { id: "integrations", en: "Integrations", ru: "Интеграции", icon: Plug },
    { id: "mobile", en: "Mobile", ru: "Телефон", icon: Smartphone },
  ] },
  { en: "Workflows", ru: "Рабочие процессы", items: [
    { id: "automations", en: "Automations", ru: "Автоматизации", icon: AlarmClock },
    { id: "artifacts", en: "Artifacts", ru: "Артефакты", icon: Shapes, badge: "beta" },
    { id: "share-skills", en: "Share skills", ru: "Обмен навыками", icon: BookOpen, badge: "beta" },
    { id: "session-search", en: "Agent session search", ru: "Поиск сессий агентов", icon: History },
    { id: "git", en: "Git & source control", ru: "Git и контроль версий", icon: GitBranch },
    { id: "task-sources", en: "Task sources", ru: "Источники задач", icon: ListTodo },
    { id: "terminal", en: "Terminal", ru: "Терминал", icon: SquareTerminal },
    { id: "quick-commands", en: "Quick commands", ru: "Быстрые команды", icon: Command },
    { id: "browser", en: "Browser", ru: "Браузер", icon: Globe },
    { id: "mobile-emulator", en: "Mobile emulator", ru: "Мобильный эмулятор", icon: MonitorSmartphone },
    { id: "floating-workspace", en: "Floating workspace", ru: "Плавающее пространство", icon: PanelsTopLeft },
  ] },
  { en: "Interface", ru: "Интерфейс", items: [
    { id: "appearance", en: "Appearance", ru: "Внешний вид", icon: Palette },
    { id: "input-editing", en: "Input & editing", ru: "Ввод и редактирование", icon: TextCursorInput },
    { id: "notifications", en: "Notifications", ru: "Уведомления", icon: Bell },
    { id: "hotkeys", en: "Shortcuts", ru: "Горячие клавиши", icon: Keyboard },
    { id: "stats-usage", en: "Stats & usage", ru: "Статистика и лимиты", icon: ChartNoAxesCombined },
    { id: "sounds", en: "Sounds", ru: "Звуки", icon: Volume2 },
  ] },
  { en: "Remote hosts", ru: "Удалённые хосты", items: [
    { id: "ssh", en: "SSH Hosts", ru: "SSH-хосты", icon: Server },
    { id: "remote-servers", en: "Remote Voxiva servers", ru: "Удалённые серверы Voxiva", icon: Network, badge: "beta" },
  ] },
  { en: "Privacy & security", ru: "Приватность и безопасность", items: [
    { id: "privacy", en: "Privacy & telemetry", ru: "Приватность и телеметрия", icon: ShieldCheck },
  ] },
  { en: "Advanced", ru: "Дополнительно", items: [
    { id: "advanced", en: "Advanced", ru: "Дополнительные настройки", icon: Wrench },
    { id: "about", en: "About & updates", ru: "О приложении и обновления", icon: Info },
  ] },
  { en: "Experimental", ru: "Экспериментальные", items: [
    { id: "experimental", en: "Experimental", ru: "Экспериментальные функции", icon: FlaskConical },
    { id: "plugins", en: "Plugins", ru: "Плагины", icon: Puzzle },
  ] },
  { en: "Projects", ru: "Проекты", items: [
    { id: "projects", en: "Projects", ru: "Проекты", icon: FolderGit2 },
  ] },
] as const;

export const SETTINGS_SECTIONS = SETTINGS_GROUPS.flatMap(group => [...group.items]);
export type SectionId = typeof SETTINGS_SECTIONS[number]["id"];
export const SETTINGS_SEARCH_TERMS: Partial<Record<SectionId, string>> = {
  general: "resume startup запуск восстановление",
  agents: "cli install catalog detected codex claude gemini opencode установка каталог",
  appearance: "theme dark light color zoom language шрифт тема цвет масштаб язык",
  notifications: "attention ring уведомления внимание рамка",
  sounds: "audio bell chime volume звук сигнал громкость",
  hotkeys: "keyboard shortcut bindings сочетания клавиши бинды",
  terminal: "shell powershell cmd bash font rendering gpu scrollback оболочка шрифт прокрутка",
  browser: "cookies import login сессии куки импорт авторизация",
  mobile: "phone companion qr телефон подключение",
  about: "version update github версия обновление",
  "input-editing": "copy paste clipboard right click mouse копирование вставка мышь буфер",
  "stats-usage": "limits memory ports ресурсы лимиты память порты",
  ssh: "remote server port hostname удалённый сервер хост порт",
};
export function isSettingsSection(value: string | null): value is SectionId {
  return SETTINGS_SECTIONS.some(section => section.id === value);
}
