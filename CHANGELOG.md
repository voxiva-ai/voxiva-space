# Changelog

All notable changes to Voxiva Space are documented here.

## [0.2.4] - 2026-10-10

### Fixed

- Context menus now hide only browser views they actually cover; websites in other panes remain visible.
- Browser submenus choose the side that avoids an open website and stay within the window, including the "Browser below" action.
- The right-side browser uses the same compact controls and styling as workspace browser panes.
- Showing an existing browser no longer triggers a misleading loading indicator.

## [0.2.3] - 2026-10-10

### Fixed

- Clicking an attention notification focuses and expands the relevant pane while preserving neighboring sessions and browser pages.
- Multiple browser panes remain visible even when a different pane has keyboard focus.
- Browser pages wait for their pane to become visible before opening, avoiding blank or failed previews.
- The right-side browser panel hides correctly and keeps its page when switching workspaces.

## [0.2.2] - 2026-10-10

### Improved

- Restored the dimensional folded-ribbon Voxiva Space mark requested by the project owner.
- Enlarged the symbol inside desktop and package icons and refined it to the Voxiva AI amber/cyan-blue palette.
- Kept browser pages alive across views, tabs, and the right assist panel instead of closing them.
- Prevented native browser surfaces from covering context menus, flyouts, and dialogs.

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
