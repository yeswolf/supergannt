# 00 — Product overview and vision

## 1. Product name and positioning

**SuperGantt** is a free, modern alternative to paid / legacy project planning tools (notably **Microsoft Project** and, for open-source scheduling behavior, **ProjectLibre**).

Primary user jobs:

1. Open real Microsoft Project plans (`.mpp` / `.mpt`).
2. Edit the plan with familiar project-management concepts (tasks, links, resources, calendars, baselines).
3. Save back in formats that other tools can open — especially **native `.mpp` that Microsoft Project opens**, plus MSPDI XML, MPX, and PDF export.
4. Run the same product in **browser**, **Docker**, **desktop (Tauri / WebView2 Windows installer)**, and **Android (offline APK)**.

Tone of product goals from the original brief:

- Not “another ugly legacy UI”.
- Not a proprietary trap.
- Prefer **ready libraries** heavily, but do **not** refuse proprietary formats — find or build a path to real `.mpp`.
- Code must stay **CLEAN** (domain / application / infrastructure / presentation) with **no ongoing violations**.

## 2. Original charter (verbatim intent)

The founding request asked for a web application that:

1. **Can read, write, save and edit all MS Project files**, using existing libraries where possible.
2. **Uses as many ready-made libraries as possible** (do not reinvent Gantt, XML, PDF, HTTP, etc. without cause).
3. **Uses a CLEAN approach everywhere** — perfect layering, no CLEAN violations.
4. **Provides a clean and modern UI**.
5. **Has the same functions as ProjectLibre** (functional parity target, not a pixel-perfect clone of ProjectLibre’s Swing UI).
6. Goal: edit MS Project files and create plans using a **free app with clean modern UI**, not paid or ugly legacy apps.

Additional founding constraints:

- **Always cover functionality with tests** and verify with them.
- **Minimum 80% test coverage**.
- App must be **Docker-runnable**.
- User must be able to **launch it on desktop**.

## 3. North-star references

| Reference | Role in requirements |
|-----------|----------------------|
| Microsoft Project (incl. “2026-like” modern Fluent UI) | File formats, UX chrome, Gantt interactions, WBS, constraints |
| ProjectLibre | Scheduling semantics (ASAP, links, calendars, effort rules, views inventory) |
| MPXJ | Industry read path for Project files |
| DHTMLX Gantt | Interactive Gantt chart |
| MSPDI | Official XML interchange with Project / ProjectLibre |
| OLE Compound Document | Container for classic `.mpp` |

## 4. Success criteria (product-level)

The product is successful when:

1. A user can open a real `.mpp` from disk / Downloads.
2. They can edit tasks, predecessors, resources, calendars, and see schedule updates immediately in ProjectLibre-compatible ways.
3. They can save:
   - unchanged files **byte-identical** to the original `.mpp` (binary compare, no “re-open and hope”);
   - edited files as Project-openable `.mpp` plus MSPDI / MPX / PDF as needed.
4. The same codebase runs via `npm run dev`, Docker, and a packaged Windows `.exe` installer without “blank 404” windows.
5. Automated tests stay green and coverage of application `src` stays **≥ 80%** on statements, branches, functions, and lines.
6. UI is modern (flat tool aesthetic, Geist Mono, themes), with proper app icon, adaptive shell (desktop / web / mobile), command palette, and view set comparable to ProjectLibre’s planning surfaces.

## 5. Explicit non-goals / rejected approaches

Documented from chat decisions (see also ADRs):

- **Do not** tell the user “`.mpp` is proprietary, impossible” and stop. Requirement is to solve it.
- **Do not** ship a custom “almost mpp” format that MS Project cannot open natively.
- **Do not** depend on **Aspose** (explicitly rejected; build/own path instead).
- **Do not** require Windows-only OLE automation of installed MS Project as the only save path — solution must be usable cross-platform for the app runtime (Java/Node path is acceptable).
- **Do not** weaken coverage thresholds to fake 80%.

## 6. Personas and environments

- **PM / scheduler** editing plans locally, exchanging with colleagues on MS Project.
- **Developer** running `npm run dev` + tests.
- **End user on Windows** installing `SuperGantt-Setup-*.exe`, possibly without JDK preinstalled (runtime must locate or fetch a JRE).

## 7. Language and docs

- End-user README: English (shipping requirement from chat).
- Internal requirements in `docs/`: detailed enough to implement without re-reading chat transcripts.
