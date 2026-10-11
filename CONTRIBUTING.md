# Contributing to Voxiva Space

Thanks for helping improve Voxiva Space. Keep changes focused, explain the user-facing problem, and include the smallest useful verification.

## Local setup

Requirements: Windows 10/11 or macOS 13+, Node.js 20+, and Rust stable. Windows builds also need MSVC Build Tools; macOS builds need Xcode Command Line Tools.

```powershell
npm ci
npm run dev
```

`npm run dev` builds the Rust PTY sidecar and opens the Electron desktop app. The Vite URL alone cannot exercise native terminal, filesystem, or Chromium browser commands.

## Before opening a pull request

```powershell
npm run build
npm run electron:check
```

For terminal or layout changes, also verify at least one normal shell and one full-screen agent TUI while resizing and splitting panes.

## Pull requests

- Describe what changed and why.
- Keep unrelated formatting or refactors out of the diff.
- Add screenshots for visible UI changes when practical.
- Never commit credentials, session data, local workspaces, installers, or build output.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
