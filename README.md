# Voxiva Space

Desktop agent workspace (Tauri + React): vertical workspaces, split terminals, bot presets, attention rings, task board, and embedded browser.

## Local development

```powershell
npm install
npm run dev
```

UI-only (no PTY):

```powershell
npm run web:dev
```

## Build Windows installer

```powershell
npm run tauri:build
```

Or:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\build-windows-release.ps1
```

## Shortcuts

- `Ctrl+T` new terminal
- `Ctrl+D` / `Ctrl+Shift+D` split
- `Ctrl+W` close pane
- `Ctrl+U` jump to unread
- `Ctrl+B` board · `Ctrl+E` browser
- `Ctrl+1…9` switch workspace
