# SuperGantt — documentation index

This folder is the **canonical requirements and decision record** distilled from the full product chat history (initial vision through desktop packaging, scheduling parity with ProjectLibre, Network Diagram, adaptive shell, themes, and regression fixes).

Use these documents when implementing features, reviewing PRs, writing tests, or deciding “does this match what we agreed?”.

## Contents

| Document | What it covers |
|----------|----------------|
| [requirements-catalog.ru.md](./requirements-catalog.ru.md) | **Full Russian catalog + chat traceability (start here for exhaustive checklist)** |
| [requirements/00-overview.md](./requirements/00-overview.md) | Product vision, goals, non-goals, success criteria |
| [requirements/01-architecture-quality.md](./requirements/01-architecture-quality.md) | CLEAN architecture, libs policy, code quality, test coverage |
| [requirements/02-file-formats.md](./requirements/02-file-formats.md) | `.mpp` / MSPDI / MPX / PDF open-save rules, identity, Java runtime |
| [requirements/03-scheduling.md](./requirements/03-scheduling.md) | ProjectLibre parity: links, constraints, effort triangle, calendars, milestones |
| [requirements/04-ui-ux.md](./requirements/04-ui-ux.md) | Adaptive shell, themes, ViewHeader, Gantt, Task Info, Network, histograms |
| [requirements/05-runtime-packaging.md](./requirements/05-runtime-packaging.md) | Web, Docker, Tauri desktop, installer, ports, JDK discovery |
| [requirements/06-testing-verification.md](./requirements/06-testing-verification.md) | Tests, fixtures, coverage ≥80%, always-test-then-build rule |
| [requirements/07-bugfixes-and-regressions.md](./requirements/07-bugfixes-and-regressions.md) | Confirmed bugs from late chats and required invariants |
| [decisions/adr-index.md](./decisions/adr-index.md) | Architecture / vendor decisions (Aspose rejected, OLE path, etc.) |

## How to use

1. **New feature** → find the matching requirements chapter; implement against MUST/SHOULD; add tests listed there.
2. **Bugfix** → check [07-bugfixes-and-regressions.md](./requirements/07-bugfixes-and-regressions.md) for known failure modes (e.g. Task Info OK tab order).
3. **Packaging** → follow [05-runtime-packaging.md](./requirements/05-runtime-packaging.md) and the verification gate in [06-testing-verification.md](./requirements/06-testing-verification.md).

## Source of truth

- Chat transcripts under the Cursor project `agent-transcripts` for SuperGantt.
- Living product surface: `README.md`, `package.json` scripts, `src/**`, `server/**`, `src-tauri/**`.

If code and this docs folder disagree, **update the docs in the same change** (or explicitly mark a requirement as superseded in an ADR).
