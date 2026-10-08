# Contributing to Voxiva Space

Thanks for helping improve Voxiva Space. Keep changes focused, explain the user-facing problem, and include the smallest useful verification.

## Local setup

Requirements: Windows 10/11, Node.js 20+, Rust stable with MSVC, Visual Studio Build Tools, and WebView2.

```powershell
npm ci
npm run dev
```

`npm run dev` opens the Tauri desktop window. The Vite URL alone cannot exercise native terminal, filesystem, or browser commands.

## Before opening a pull request

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

For terminal or layout changes, also verify at least one normal shell and one full-screen agent TUI while resizing and splitting panes.

## Pull requests

- Describe what changed and why.
- Keep unrelated formatting or refactors out of the diff.
- Add screenshots for visible UI changes when practical.
- Never commit credentials, session data, local workspaces, installers, or build output.

By contributing, you agree that your contribution is licensed under the repository's MIT license.
