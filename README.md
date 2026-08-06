# Voxiva Space

Desktop agent workspace: Tauri 2 + React + Vite. Split terminals, workspaces, agents, board, companion phone bridge.

## Layout (for developers)

```
src/
  app/                 # App shell, routing by view
  components/          # Shared UI (shell, icons, pickers)
  features/
    agents/            # Bot presets
    board/             # Task board store
    browser/           # Embedded WebView browser
    companion/         # Phone LAN bridge client
    editor/            # File tree + CodeMirror
    hotkeys/           # Remappable shortcuts
    sounds/            # Attention / exit alerts
    terminal/          # xterm + PTY invoke + spawn queue
    theme/             # Glass / acrylic window sync
    ui/                # Zoom and chrome helpers
    workspace/         # Spaces, splits, SpaceContext
  pages/               # One folder per view
  styles/              # CSS by area (shell, terminal, settings…)
  i18n.ts              # ru/en strings
src-tauri/             # Rust: PTY, companion server, tray
```

## Dev

```powershell
npm install
npm run dev
```

UI only (no native PTY):

```powershell
npm run web:dev
```

## Build

```powershell
npm run tauri:build
```

## Notes

- Hotkeys: Settings → Keyboard (Alt/Ctrl chords work inside terminals).
- Zoom: Ctrl + / − / 0, Ctrl + wheel.
- Companion: Settings → Phone (port 17847).
