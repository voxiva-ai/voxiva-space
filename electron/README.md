# Electron migration

The Electron main process runs the React UI, sandboxed Chromium `WebContentsView` browser panes, and a Rust PTY sidecar. Browser pages do not receive the privileged app preload.

Local checks:

```sh
npm ci
npm run build
cargo build --manifest-path native/Cargo.toml
npm run electron:app-smoke
```

`npm run electron:app` opens the full app. `npm run electron:pack` creates an unpacked platform build in `release/`; `npm run electron:dist` creates installer artifacts. The smoke test uses an isolated temporary profile and verifies React, IPC, the Rust terminal, and Chromium inspector. Unit tests live beside the Electron modules.

On Windows, first launch imports workspace state from the previous WebView2 profile without changing the old profile. Public macOS auto-updates require Apple signing and notarization credentials; unsigned local builds are for testing only.
