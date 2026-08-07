# Auto-save to localStorage with crash recovery

## Overview

SuperGantt currently only persists plans via explicit save actions (Ctrl+S or menu Save). A browser tab crash, accidental close, or power loss wipes all unsaved work. This feature adds automatic background saving to localStorage with debounce, plus a crash recovery dialog on next open.

## User story

As a PM who just spent 45 minutes tweaking a schedule, I want the app to save my work automatically in the background, and if my browser crashes, I want to be offered recovery of the unsaved changes when I reopen the app, so I never lose more than a minute of work.

## Acceptance criteria

1. **Auto-save trigger:** The workspace auto-saves to localStorage 2 seconds after the last mutation (debounced), with a maximum interval of 30 seconds if mutations are continuous. **First edit:** The very first mutation after clean-load triggers an immediate auto-save on the next poll tick (~500 ms) rather than waiting for the full debounce cycle. This ensures the first unsaved change is snapshotted quickly without holding up subsequent debounced saves.
2. **Dirty flag:** The toolbar/app chrome shows a Saving / Saved indicator. A visual dot or asterisk appears in the title bar when there are unsaved changes.
3. **Manual save preserved:** Ctrl+S / Save command still works and saves immediately, clearing the dirty flag.
4. **Recovery dialog:** On app open, if an auto-saved state exists that is newer than the last explicit save, show a non-blocking recovery banner with the unsaved timestamp and Restore / Discard buttons. Restoring loads the auto-saved state; discarding loads the last explicit save.
5. **File-level isolation:** Auto-save state is keyed per file name/source. Opening a different file does not offer recovery from the previous file.
6. **Storage awareness:** If localStorage is near quota, auto-save is skipped (no crash) and a warning icon appears. The existing save path is unaffected.
7. **No double-save:** When the user explicitly saves, the auto-save snapshot is cleared (no stale recovery offer for already-saved work).

## Technical notes

- `LocalStorageProjectRepository` already serializes `Project` to localStorage under a fixed key. Extend it with: `saveAutoSnapshot(project, metadata)`, `getAutoSnapshotMetadata()`, `clearAutoSnapshot()`.
- The debounce logic (2s after last mutation, max 30s interval) lives in a hook `useAutoSave` in the presentation layer.
- Serialization uses `ProjectJsonSerializer` — fast for typical plans (<500 tasks).
- On Android (Tauri WebView), localStorage may be cleared by the OS under storage pressure — acceptable; recovery banner simply won't appear.
- The recovery dialog is a lightweight modal/banner component, not a full dialog — it should not block the user from starting fresh.
