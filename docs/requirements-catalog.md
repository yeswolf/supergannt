# SuperGantt requirements catalog (chat traceability)

English checklist for implementation. Full MUST contracts live in [`requirements/`](./requirements/) and decisions in [`decisions/`](./decisions/).

Source: product chat history (founding brief, ProjectLibre parity, MPP identity, desktop/installer, Network, icons, Task Info OK, Start/link scheduling, shortcuts, etc.).

Priority legend:

- **MUST** — required; violation = defect.
- **SHOULD** — strong expectation; deviate only with an ADR.
- **PROCESS** — agent/developer working rules, not a runtime feature.

---

## A. Product and architecture

| ID | Pri | Requirement | Origin |
|----|-----|-------------|--------|
| A1 | MUST | Web app to read / write / edit MS Project files | Founding brief |
| A2 | MUST | Prefer ready-made libraries | Founding brief |
| A3 | MUST | CLEAN architecture; no layer violations | Founding brief |
| A4 | MUST | Clean modern UI | Founding brief |
| A5 | MUST | Functional parity with ProjectLibre (planning capabilities) | Brief + follow-ups |
| A6 | MUST | Do not refuse `.mpp` as “proprietary impossible” — find/build a path | Owner: proprietary format is not an excuse |
| A7 | MUST | English README for end users + references; publish on GitHub | README request |
| A8 | SHOULD | Visual language “MS Project 2026 / Fluent”-like | “make ui beautiful and MS Project 2026 like” |

See: `requirements/00-overview.md`, `01-architecture-quality.md`, ADR-001…004.

---

## B. File formats and interop

| ID | Pri | Requirement | Origin |
|----|-----|-------------|--------|
| B1 | MUST | Open/Save `.mpp` / `.mpt` | Brief + MPP work |
| B2 | MUST | Saved `.mpp` opens in **native MS Project** | Need Project-openable `.mpp` |
| B3 | MUST | No custom “almost mpp” format | Same |
| B4 | MUST | No Aspose — own implementation | “without Aspose; write it yourself” |
| B5 | MUST | Cross-platform converter runtime (not Windows-only OLE automation) | ADR-003 |
| B6 | MUST | Unchanged file → **byte-identical** save | Binary compare of files |
| B7 | MUST | After edits — semantic / structural match via reverse-engineered writer | Reverse-engineering save path |
| B8 | MUST | MSPDI XML open/save | Product matrix |
| B9 | MUST | Export MPX | Product matrix |
| B10 | MUST | Export PDF | PDF export request |
| B11 | MUST | ≥10 complex real `.mpp` fixtures in tests | Fixture pack request |
| B12 | MUST | Auto-discover JDK/JRE; if missing, install into app runtime | JDK discovery / APPDATA pack |
| B13 | MUST | Fix headless AWT / mppjs `UnsatisfiedLinkError` on server path | AWT stack traces |

See: `requirements/02-file-formats.md`.

---

## C. Scheduling and ProjectLibre behavior

| ID | Pri | Requirement | Origin |
|----|-----|-------------|--------|
| C1 | MUST | Minimal time slot is **hours**, not days | “minimal time slot must be hours” |
| C2 | MUST | 0 hours ⇒ milestone | “tasks with 0 hours must be milestones” |
| C3 | MUST | Milestone on Gantt is a **diamond** | “diamond mark” |
| C4 | MUST | Edit predecessors/links like ProjectLibre | Predecessors UX |
| C5 | MUST | Calendars: any day → holiday / non-working | Same thread |
| C6 | MUST | All missing ProjectLibre views/abilities | “add all missing pieces…” |
| C7 | MUST | Assign resources from Gantt and other views | Assign UX |
| C8 | MUST | Click task name on Gantt → Task Info, not Assign; empty Assign without `--Assign` | Explicit UI ask |
| C9 | MUST | Gantt zoom in/out, ProjectLibre-aligned | Zoom controls |
| C10 | MUST | Dependency changes reschedule immediately like ProjectLibre | Immediate relations update |
| C11 | MUST | FS “after” successor shifts after predecessor finish | “next after” / FS after |
| C12 | MUST | Soft constraints must not block FS (clear to ASAP); hard MSO/MFO kept | Link-driven successor |
| C13 | MUST | Effort-triangle recalculation on load/assignment changes | Resource load rules |
| C14 | MUST | Edit task Start/Finish dates | Start/Finish editing |
| C15 | MUST | Baseline set/clear | Project ribbon |
| C16 | MUST | Start change: hours fixed, Finish = start+hours; later→SNET, earlier/past→MSO; successors shift; project start may roll back for past dates | Start date / move earlier into the past |
| C17 | MUST | Mouse FS on Gantt immediately moves successor; desktop without `touch:force` | Mouse link drew nothing |
| C18 | MUST | Drag start→finish → FS with swapped ends (first = predecessor of second) | Reverse drag gesture |
| C19 | MUST | `setPredecessorLinks` does not clear soft pins when predecessor rows are unchanged | Start OK + FS |
| C20 | MUST | Task Info OK: Start applied last; Advanced ASAP must not undo Start | OK left Start stuck |

See: `requirements/03-scheduling.md`, ADR-004, ADR-006.

---

## D. UI / UX

| ID | Pri | Requirement | Origin |
|----|-----|-------------|--------|
| D1 | MUST | Good toolbar icons | “add beautiful icons” |
| D2 | MUST | Larger icons (CSS variables) | Icon size |
| D3 | MUST | Ribbon / chrome constant height (no jump) | Height stability |
| D4 | MUST | Enter in Task Info / Assign fields = OK | Enter to save |
| D5 | MUST | Histogram bar height ∝ hours | Equal-height histogram bug |
| D6 | MUST | Loader on every plan open | Always show loader |
| D7 | MUST | Network Diagram with arrowheads | Network arrows |
| D8 | MUST | Network not blank / frozen (no infinite re-render) | Network empty |
| D9 | MUST | Network wrap routing under floor, not diagonal through cards | Right-edge wrap |
| D9a | MUST | Network layer columns wrap by viewport width (new band), not one infinite row | Band wrap |
| D10 | MUST | Branded application icon | App icon |
| D11 | MUST | Icon corners transparent, not black | Black corners |
| D12 | SHOULD | Title-bar brand mark matches app icon | Icons.app |
| D13 | MUST | Adaptive shell without Office ribbon / separate action strip; actions in ViewHeader | Ideal UX / remove context bar |
| D14 | MUST | Themes (Light/Dark/Contrast/Darcula/Solarized); Gantt follows `--msp-*` | Themes + Gantt borders |
| D15 | MUST | No File menu — file actions via command palette; Theme menu stays | Remove File menu |
| D16 | MUST | Sample plan already scheduled (finish/work/assignments), not zero spans | Sample plan hours |
| D17 | SHOULD | Modern scrollbars without arrow buttons | Scrollbar styling |
| D18 | MUST | Gantt timescale dropdown; task tree hide only on Android | Timescale / hide tree |
| D19 | MUST | Delete on row/selection deletes task (not while typing in inputs) | Delete key |
| D20 | MUST | Gantt focus/click drives the same toolbar as Task Sheet | Gantt selection chrome |
| D21 | MUST | Critical+selected: red bar stays visible | Critical selection blend |
| D22 | MUST | ProjectLibre-style shortcuts; `keyboard-shortcuts.md` + README link | Shortcuts doc |
| D23 | MUST | Click empty timeline row cell selects the task | Empty-row select |

See: `requirements/04-ui-ux.md`, `keyboard-shortcuts.md`.

---

## E. Runtime, Docker, desktop

| ID | Pri | Requirement | Origin |
|----|-----|-------------|--------|
| E1 | MUST | Docker-runnable | Founding brief |
| E2 | MUST | Desktop launch (Tauri / WebView2) | Brief + desktop verify |
| E3 | MUST | Installer packaging command | Pack command request |
| E4 | MUST | Build exe/installer on request | Build installer |
| E5 | MUST | Installed exe must not show 404 | Post-install 404 |
| E6 | MUST | Port ready = health **and** HTML UI; else other port / error | 404 investigation |
| E7 | PROCESS | Before pack: always tests, then build | “always check tests then build” |

See: `requirements/05-runtime-packaging.md`.

---

## F. Tests and process quality

| ID | Pri | Requirement | Origin |
|----|-----|-------------|--------|
| F1 | MUST | Cover functionality with tests | Founding brief |
| F2 | MUST | ≥ **80%** coverage | Brief + “≥80% of all code” |
| F3 | MUST | 80% measured on **all** app `src`, not a narrowed include | Coverage scope |
| F4 | PROCESS | Multitask when many independent workstreams | Multitasking |
| F5 | PROCESS | Verify background agents by artifacts; restart if dead | Agent health |
| F6 | PROCESS | Verify claimed features actually landed | Feature audit |

See: `requirements/01-architecture-quality.md`, `06-testing-verification.md`, ADR-005.

---

## G. Invariant index (by chapter — no separate dump)

| ID | Invariant | Where MUST |
|----|-----------|------------|
| G1 | Network measure effect must not depend on fresh array identities | `04` Network |
| G2 | Network orthogonal + floor-lane wrap | `04` Network |
| G3 | Task Info OK: Advanced→Resources→General(non-date)→Predecessors→Start/Finish last | `04` Task Info |
| G4 | `setTaskAssignments` no-op for same resource/units multiset | `03` §6.5 / `04` |
| G5 | FS: soft pins clear only when predecessor set **changes** | `03` §4.4 |
| G6 | Desktop probe: ready = health + HTML | `05` §3 |
| G7 | ICO with PNG-alpha; corners A=0 | `05` §2.2 / `04` branding |
| G8 | openPlanFile: loader + FileReader + single-flight | `04` loader |
| G9 | Histogram height ∝ hours | `04` histogram |
| G10 | Enter = OK (except textarea/button; Shift+Enter in Notes) | `04` Task Info |
| G11 | Start later→SNET, earlier/past→MSO; hours fixed; cascade; project start may roll back | `03` §5.1 |
| G12 | Gantt mouse link: no desktop `touch:force`; immediate schedule sync | `03` §9 / `04` Gantt |
| G13 | `orientDraggedLink`: SF start→finish → FS swapped | `03` §4.5 |
| G14 | Critical selected: ring, not fill overwrite | `04` §5.2 |
| G15 | Timeline empty-row click → `selectTask` | `04` §5.1 |

---

## H. Out of product scope (from chats, not app requirements)

| Topic | Note |
|-------|------|
| Killing Edge / freeing RAM | One-off machine help, not a SuperGantt feature |
| Sigterm / agent process debugging | Cursor process, not the product |

---

## Reading order for a new agent

1. [`docs/README.md`](./README.md)  
2. This catalog (traceability)  
3. Topic chapter (`02` files / `03` schedule / `04` UI / `05` pack / `06` tests)  
4. ADRs for contested decisions  

When behavior changes, update the matching chapter and this catalog row in the same change.
