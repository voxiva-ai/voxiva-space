# Changelog

All notable changes to Voxiva Space are documented here.

## [0.2.1] - 2026-10-09

### Improved

- Matched the Voxiva AI amber and cyan-blue gradients across the app and enlarged the Windows mark.
- Added an automatic in-app update notice that includes beta releases.

### Fixed

- Found Codex installed by the desktop app even when Explorer started with an older `PATH`.
- Removed the intentionally empty terminal row and column without reintroducing HiDPI clipping.
- Made the one-command installer resolve the newest published beta or stable release.

## [0.2.0] - 2026-10-08

### Added

- Workspace file tree with collapsible folders and pane previews.
- Multilingual project documentation, CI, tagged Windows releases, and one-command installer.
- New Voxiva Space identity and complete desktop icon set.

### Improved

- Terminal and ConPTY resizing for full-screen Claude Code, OpenCode, Codex, and Gemini interfaces.
- Agent session resume, drag-and-drop attachments, paste behavior, notification sounds, and browser inspection.
- Voxiva theme contrast, terminal chrome, and responsive workspace layout.

### Fixed

- Cropped terminal rows and columns after pane or window resize.
- Visual fragments caused by fractional cell dimensions and scroll viewport overlap.
- Missing file-tree translations and several startup/update edge cases.
