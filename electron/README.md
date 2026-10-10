# Electron migration pilot

`npm run electron:pilot` opens two native Chromium `WebContentsView` panes. Resize the window and right-click a page to test native context menus without hiding either site. `npm run test:electron-pilot` checks pane clipping.

`npm run electron:smoke` creates a sandboxed Chromium view and verifies it loads on Windows and macOS in CI. It does not test user interactions.

This is **not** the Voxiva Space application or an installer. The current v0.2.4 Tauri build remains the supported release. Before replacing it, the Electron shell needs the existing React chrome, a Rust sidecar for terminal and filesystem services, a narrow validated IPC bridge for every frontend command/event, browser inspector and cookie parity, workspace persistence, and tested Windows/macOS packaging and updates. Do not publish the pilot as a release.

The intended product architecture is Electron main process + sandboxed React renderer + `WebContentsView` browser panes + Rust native sidecar. Remote pages must stay sandboxed and separate from the privileged app renderer. macOS release builds also need signing and notarization credentials.
