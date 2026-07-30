# ADR-003 — Cross-platform MPP conversion (not Windows MS Project Automation-only)

## Status

Accepted.

## Context

Owner asked whether OLE implied Windows-only automation. Requirement: cross-platform app runtime without “install MS Project to save.”

## Decision

- Use an in-process/out-of-process **converter** (Java jar) runnable on the app’s server side inside Tauri/Docker/Node hosts.
- OLE compound structure is the **file format**, not “drive Win32 Project via COM” as the sole write mechanism.
- Auto-provision JRE when missing.

## Consequences

- Desktop packaged resources must include jar + blank template + UI.
- Headless AWT issues must be configured away for server converts.
