<p align="center">
  <img src="src/assets/brand/voxiva-space-mark.png" width="112" alt="Логотип Voxiva Space" />
</p>

<h1 align="center">Voxiva Space</h1>

<p align="center">Рабочее пространство Windows для терминалов, coding‑агентов, файлов и браузерного превью.</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

> **Beta v0.2.0.** Приложением уже можно пользоваться, но интерфейс и модель восстановления сессий ещё развиваются.

## Всё для работы с агентами — в одном окне

Запускай Claude Code, Codex, OpenCode, Gemini CLI, Aider, Amp, Goose, Cursor Agent и любые другие терминальные инструменты. Voxiva Space объединяет терминалы, файлы, браузер, задачи и уведомления агентов в одном адаптивном рабочем пространстве.

### Возможности

- терминальные агенты из Vault и обычные shell‑сессии;
- горизонтальные и вертикальные сплиты, вкладки и максимизация панели;
- корректный ресайз полноэкранных TUI Claude Code и OpenCode без обрезки;
- дерево файлов и предпросмотр медиа рядом с терминалом;
- встроенный браузер для локального сайта;
- подсветка панелей, где агент ждёт ответа;
- восстановление раскладки и продолжение поддерживаемых сессий;
- настраиваемые горячие клавиши, command palette и drag-and-drop;
- локальное хранение данных, без аккаунта Voxiva и телеметрии.

## Установка

Скачай свежий `*-setup.exe` из [GitHub Releases](https://github.com/voxiva-ai/voxiva-space/releases) или выполни:

```powershell
irm https://raw.githubusercontent.com/voxiva-ai/voxiva-space/main/scripts/tester-install.ps1 | iex
```

Если хочешь сначала проверить скрипт, открой [`scripts/tester-install.ps1`](scripts/tester-install.ps1), скачай его и запусти локально.

Нужны Windows 10/11 и Microsoft Edge WebView2. Для удаления: **Параметры → Приложения → Установленные приложения → Voxiva Space → Удалить**.

## Быстрый старт

1. Открой Voxiva Space и выбери папку проекта.
2. Выбери раскладку на 1, 2, 4 или 8 панелей.
3. Открой **Агенты** и запусти CLI, найденный в `PATH`.
4. Делай сплиты, открывай браузер или перетаскивай файлы в запрос агента как `@пути`.

Voxiva Space не устанавливает сторонние CLI и не выполняет вход вместо тебя. Установи нужный агент из официального источника и авторизуйся в нём один раз.

## Основные горячие клавиши

Все сочетания меняются в **Настройки → Горячие клавиши**.

| Действие | Сочетание |
| --- | --- |
| Новая вкладка терминала | `Ctrl+T` |
| Закрыть вкладку | `Ctrl+W` |
| Вернуть закрытую вкладку | `Ctrl+Shift+T` |
| Сплит справа | `Ctrl+D` |
| Сплит снизу | `Alt+F` |
| Развернуть панель | `Ctrl+Shift+Enter` |
| Предыдущая / следующая панель | `Alt+J` / `Alt+K` |
| Последний агент, ожидающий ответа | `Ctrl+Shift+U` |
| Новый space | `Ctrl+N` |
| Масштаб | `Ctrl++` / `Ctrl+-` / `Ctrl+0` |

## Сборка из исходников

Нужны Node.js 20+, Rust stable с MSVC, Visual Studio Build Tools и WebView2.

```powershell
git clone https://github.com/voxiva-ai/voxiva-space.git
cd voxiva-space
npm ci
npm run dev
```

Проверки и установщик:

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

Подробнее о работе с проектом: [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[MIT](LICENSE) © 2026 участники Voxiva AI.
