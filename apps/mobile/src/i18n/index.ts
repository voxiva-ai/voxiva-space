import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "en" | "ru";

const LOCALE_KEY = "voxiva.space.locale";

const en = {
  "tabs.home": "Home",
  "tabs.spaces": "Spaces",
  "tabs.history": "History",
  "tabs.board": "Board",
  "tabs.settings": "Settings",

  "home.welcome": "Welcome back",
  "home.desktop": "Desktop",
  "home.metricSpaces": "Spaces",
  "home.metricSessions": "Active",
  "home.metricTasks": "Open tasks",
  "home.connectTitle": "Connect your desktop",
  "home.connectHint": "Pair with Voxiva Space to see workspaces and tasks here.",
  "home.taskCount": "{count} open tasks",
  "home.resume": "Pick up where you left off",
  "home.tasks": "Tasks",
  "home.quickActions": "Quick actions",
  "home.pair": "Pair a desktop",
  "home.openSpaces": "Browse spaces",
  "home.noSpaces": "No spaces yet",
  "home.noTasks": "No open tasks",
  "home.online": "Connected",
  "home.offline": "Can't reach desktop",
  "home.sessions": "{count} active terminals",
  "home.openBoard": "Open board",

  "spaces.search": "Search",
  "spaces.empty": "No spaces",
  "spaces.emptySearch": "Nothing found",
  "spaces.offline": "Offline · {name}",
  "spaces.sessionsNone": "No sessions",
  "spaces.sessionsOne": "1 terminal",
  "spaces.sessionsMany": "{count} terminals",

  "history.empty": "No history",
  "history.emptySearch": "Nothing found",
  "history.open": "Open",
  "history.gone": "Removed",

  "board.empty": "No tasks",
  "board.placeholder": "New task…",
  "board.pickWorkspace": "Pick a space",
  "board.col.todo": "Todo",
  "board.col.progress": "In progress",
  "board.col.review": "Review",
  "board.col.done": "Done",
  "board.col.cancelled": "Cancelled",

  "workspace.terminals": "Terminals",
  "workspace.browser": "Browser",
  "workspace.board": "Board",
  "workspace.sessionsEmpty": "No terminals",
  "workspace.browserEmpty": "No browsers",
  "workspace.openUrl": "Open",
  "workspace.spawn": "Spawn",
  "workspace.spawnTitle": "New session",
  "workspace.spawnShell": "Shell",
  "workspace.spawnOpenCode": "OpenCode",
  "workspace.spawnReady": "Ready agents",
  "workspace.spawnBusy": "Starting…",
  "workspace.addTask": "Add task…",
  "workspace.boardEmpty": "Empty",
  "workspace.rename": "Rename terminal",
  "workspace.renameHint": "Long-press to rename",

  "settings.appearance": "Appearance",
  "settings.appearanceHint": "Theme",
  "settings.theme": "Theme",
  "settings.theme.system": "System",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.language": "Language",
  "settings.languageHint": "App language",
  "settings.lang.en": "English",
  "settings.lang.ru": "Русский",
  "settings.devices": "Devices",
  "settings.devicesHint": "Paired PCs",
  "settings.noDevices": "No devices",
  "settings.active": "Active",
  "settings.connecting": "connecting…",
  "settings.pair": "Pair",
  "settings.pairHint": "QR from Space on PC",
  "settings.scan": "Scan QR",
  "settings.scanMeta": "Camera",
  "settings.beta": "Beta",

  "scan.title": "Scan QR",
  "scan.web": "Camera needs a phone build",
  "scan.webHint": "Use Expo Go / Android APK, or open the pair link from Space.",
  "scan.badQr": "Not a Space QR. Open Settings → Phone on PC.",

  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.online": "Online",
  "common.offline": "Offline",
  "common.terminal": "Terminal",
  "common.error": "Something went wrong",
} as const;

type MessageKey = keyof typeof en;

const ru: Partial<Record<MessageKey, string>> = {
  "home.metricSpaces": "Пространства",
  "home.metricSessions": "Активные",
  "home.metricTasks": "Открытые задачи",
  "home.connectTitle": "Подключите компьютер",
  "home.connectHint": "Подключитесь к Voxiva Space, чтобы видеть проекты и задачи.",
  "home.taskCount": "Открытых задач: {count}",
  "tabs.home": "Главная",
  "tabs.spaces": "Spaces",
  "home.welcome": "С возвращением",
  "home.desktop": "Компьютер",
  "home.resume": "Продолжить работу",
  "home.tasks": "Задачи",
  "home.quickActions": "Быстрые действия",
  "home.pair": "Подключить компьютер",
  "home.openSpaces": "Все пространства",
  "home.noSpaces": "Пока нет пространств",
  "home.noTasks": "Нет открытых задач",
  "home.online": "Подключено",
  "home.offline": "Компьютер недоступен",
  "home.sessions": "Активных терминалов: {count}",
  "home.openBoard": "Открыть доску",
  "tabs.history": "История",
  "tabs.board": "Доска",
  "tabs.settings": "Настройки",

  "spaces.search": "Поиск",
  "spaces.empty": "Пусто",
  "spaces.emptySearch": "Ничего не найдено",
  "spaces.offline": "Офлайн · {name}",
  "spaces.sessionsNone": "Нет сессий",
  "spaces.sessionsOne": "1 терминал",
  "spaces.sessionsMany": "{count} терминала",

  "history.empty": "Пусто",
  "history.emptySearch": "Ничего не найдено",
  "history.open": "Открыть",
  "history.gone": "Удалено",

  "board.empty": "Нет задач",
  "board.placeholder": "Новая задача…",
  "board.pickWorkspace": "Выбери space",
  "board.col.todo": "Todo",
  "board.col.progress": "В работе",
  "board.col.review": "Review",
  "board.col.done": "Готово",
  "board.col.cancelled": "Отменено",

  "workspace.terminals": "Терминалы",
  "workspace.browser": "Браузер",
  "workspace.board": "Доска",
  "workspace.sessionsEmpty": "Нет терминалов",
  "workspace.browserEmpty": "Нет браузеров",
  "workspace.openUrl": "Открыть",
  "workspace.spawn": "Запустить",
  "workspace.spawnTitle": "Новая сессия",
  "workspace.spawnShell": "Shell",
  "workspace.spawnOpenCode": "OpenCode",
  "workspace.spawnReady": "Агенты",
  "workspace.spawnBusy": "Запуск…",
  "workspace.addTask": "Добавить задачу…",
  "workspace.boardEmpty": "Пусто",
  "workspace.rename": "Переименовать",
  "workspace.renameHint": "Долгое нажатие — имя",

  "settings.appearance": "Оформление",
  "settings.appearanceHint": "Тема",
  "settings.theme": "Тема",
  "settings.theme.system": "Системная",
  "settings.theme.dark": "Тёмная",
  "settings.theme.light": "Светлая",
  "settings.language": "Язык",
  "settings.languageHint": "Язык приложения",
  "settings.lang.en": "English",
  "settings.lang.ru": "Русский",
  "settings.devices": "Устройства",
  "settings.devicesHint": "Подключённые ПК",
  "settings.noDevices": "Нет устройств",
  "settings.active": "Активно",
  "settings.connecting": "подключение…",
  "settings.pair": "Пара",
  "settings.pairHint": "QR из Space на ПК",
  "settings.scan": "Сканировать QR",
  "settings.scanMeta": "Камера",
  "settings.beta": "Beta",

  "scan.title": "Сканировать QR",
  "scan.web": "Камера нужна на телефоне",
  "scan.webHint": "Собери Android APK / Expo Go, либо открой pair-ссылку из Space.",
  "scan.badQr": "Это не QR из Space. Настройки → Телефон на ПК.",

  "common.cancel": "Отмена",
  "common.save": "Сохранить",
  "common.online": "Онлайн",
  "common.offline": "Офлайн",
  "common.terminal": "Терминал",
  "common.error": "Что-то пошло не так",
};

const dict: Record<Locale, Partial<Record<MessageKey, string>>> = { en, ru };

export async function loadLocale(): Promise<Locale> {
  try {
    const raw = await AsyncStorage.getItem(LOCALE_KEY);
    if (raw === "en" || raw === "ru") return raw;
  } catch {
    // ignore
  }
  return "en";
}

export async function saveLocale(locale: Locale) {
  await AsyncStorage.setItem(LOCALE_KEY, locale);
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text = dict[locale][key] ?? dict.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  ready: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadLocale().then((next) => {
      setLocaleState(next);
      setReady(true);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void saveLocale(next);
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, ready }),
    [locale, setLocale, t, ready],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export type { MessageKey };
