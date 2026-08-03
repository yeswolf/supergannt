# SuperGantt — documentation index

This folder is the **canonical requirements and decision record** distilled from the full product chat history (initial vision through desktop packaging, scheduling parity with ProjectLibre, Network Diagram, adaptive shell, themes, and scheduling/UI contracts).

Use these documents when implementing features, reviewing PRs, writing tests, or deciding “does this match what we agreed?”.

## Contents

| Document | What it covers |
|----------|----------------|
| [requirements-catalog.md](./requirements-catalog.md) | **Full requirements catalog + chat traceability (exhaustive checklist)** |
| [requirements/00-overview.md](./requirements/00-overview.md) | Product vision, goals, non-goals, success criteria |
| [requirements/01-architecture-quality.md](./requirements/01-architecture-quality.md) | CLEAN architecture, libs policy, code quality, test coverage |
| [requirements/02-file-formats.md](./requirements/02-file-formats.md) | `.mpp` / MSPDI / MPX / PDF open-save rules, identity, Java runtime |
| [requirements/03-scheduling.md](./requirements/03-scheduling.md) | ProjectLibre parity: links, Start (SNET/MSO), SF→FS drag, constraints, effort triangle, calendars, milestones |
| [requirements/04-ui-ux.md](./requirements/04-ui-ux.md) | Adaptive shell, themes, Gantt selection/critical CSS, Task Info OK order, Network, shortcuts |
| [requirements/05-runtime-packaging.md](./requirements/05-runtime-packaging.md) | Web, Docker, Tauri desktop, Android APK, installer, ports, icons, JDK discovery |
| [android-offline.md](./android-offline.md) | Offline Android APK: MPP open/save, Downloads, build script |
| [keyboard-shortcuts.md](./keyboard-shortcuts.md) | **Keyboard shortcuts** (normative chord list; mirrored in 04 §11) |
| [requirements/06-testing-verification.md](./requirements/06-testing-verification.md) | Tests, fixtures, coverage ≥80%, verification checklist |
| [decisions/adr-index.md](./decisions/adr-index.md) | Architecture / vendor decisions (Aspose rejected, OLE path, etc.) |

## How to use

1. **New feature** → find the matching requirements chapter; implement against MUST/SHOULD; add tests listed in [06](./requirements/06-testing-verification.md).
2. **Bug fix** → fix against the **topic** chapter (scheduling → 03, UI → 04, packaging → 05); extend tests in the same area.
3. **Packaging** → follow [05-runtime-packaging.md](./requirements/05-runtime-packaging.md) and the verification gate in [06](./requirements/06-testing-verification.md).

## Source of truth

- Chat transcripts under the Cursor project `agent-transcripts` for SuperGantt.
- Living product surface: `README.md`, `package.json` scripts, `src/**`, `server/**`, `src-tauri/**`.

If code and this docs folder disagree, **update the docs in the same change** (or explicitly mark a requirement as superseded in an ADR).
