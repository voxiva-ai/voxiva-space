# Electron migration

The Electron main process runs the existing React UI, sandboxed Chromium `WebContentsView` browser panes, and a Rust PTY sidecar. Browser pages do not receive the privileged app preload. The older Tauri release remains the supported download until migration and release checks finish.

Local checks:

```sh
npm ci
npm run build
cargo build --manifest-path native/Cargo.toml
npm run electron:app-smoke
```

`npm run electron:app` opens the full app. `npm run electron:pack` creates an unpacked platform build in `release/`; `npm run electron:dist` creates installer artifacts. The smoke test uses an isolated temporary profile and verifies React, IPC, the Rust terminal, and Chromium inspector. Unit tests live beside the Electron modules.

Windows packaging has been exercised locally. CI also checks macOS packaging. Public macOS auto-updates require Apple signing and notarization credentials; unsigned local builds are for testing only. Electron's updater deliberately reads Electron release metadata rather than offering the old Tauri installer. On Windows, first launch copies the previous WebView2 local-storage database into a temporary directory and imports workspace state without changing the old profile. This still needs end-to-end verification on varied profiles; do not replace an existing installation or publish this branch as a release solely on the synthetic test.
