# SuperGantt

**A modern project planner that speaks Microsoft Project — without the license, the ribbon maze, or the “save as XML and pray” ritual.**

Open real `.mpp` plans. Edit them in the browser or on the desktop. Schedule like ProjectLibre. Save back as `.mpp`, MSPDI XML, MPX, or PDF.

SuperGantt is built for people who live in Gantt charts: PMs, schedulers, and engineers who want a fast local tool that still interoperates with **Microsoft Project** and **ProjectLibre**.

---

## What you can do

- **Open binary `.mpp` / `.mpt`** plans (the same files Project opens)
- **Edit** tasks, dates, duration, % complete, WBS, predecessors (`2FS+8h`), resources, and assignments
- **Schedule** ASAP with FS / SS / FF / SF links, lag/lead, constraints, critical path, and baselines
- **Save** as:
  - **`.mpp`** — native OLE Microsoft Project binary
  - **MSPDI `.xml`** — the official Project/ProjectLibre interchange format
  - **`.mpx`** — classic Project exchange
  - **PDF** — printable task table
- Work in **browser** or **Electron desktop**
- Run fully offline with **Docker**

Views: Gantt, Task Sheet, Resources, Network, Calendars, Reports (including earned-value style summaries).

---

## Quick start

```bash
npm install
npm run mpp:setup    # once — JDK 17+ + MPP converter JAR
npm run dev
```

Then open **http://localhost:5173**.

| Command | What it does |
|---------|----------------|
| `npm run dev` | Web UI + MPP API |
| `npm run desktop:dev` | Same, plus Electron shell |
| `npm run docker:up` | All-in-one container on port **8080** |
| `npm test` | Unit + integration tests |

> **First-time MPP setup:** `npm run mpp:setup` installs/finds JDK 17+, builds `mpp-convert.jar`, and avoids AWT crashes some native MPXJ builds hit when reading Gantt colors.

---

## Opening & saving files

| Format | Open | Save | Notes |
|--------|:----:|:----:|-------|
| `.mpp` / `.mpt` | ✓ | ✓ | Real MS Project binary (OLE compound) |
| MSPDI `.xml` | ✓ | ✓ | Best interchange with Project & ProjectLibre |
| `.mpx` | — | ✓ | Legacy exchange |
| PDF | — | ✓ | Export snapshot |

**Tip:** If a colleague uses Microsoft Project, MSPDI XML is the safest shared format. SuperGantt can also write `.mpp` for round-trips inside this app and for native Project files when you need them.

Unchanged plans save **byte-identical** to the `.mpp` you opened. After you edit, SuperGantt rewrites the schedule into a Project-style OLE file.

---

## Scheduling, the ProjectLibre way

SuperGantt follows the same mental model as ProjectLibre / MS Project:

- Working-time calendars (not naive calendar days)
- Predecessors with type + lag (`3SS-4h`)
- **Start No Earlier Than** when you drag a bar or set a start date
- Summary tasks roll up from children
- Critical path from zero total float

Edit **Start** and **Finish** in the Task Sheet or Task Information dialog — duration recalculates in working hours when you change Finish.

---

## References & inspiration

SuperGantt stands on open tools and well-known project-planning DNA:

| Reference | Role |
|-----------|------|
| **[Microsoft Project](https://www.microsoft.com/microsoft-365/project)** | UX and file-format north star (`.mpp`, MSPDI, constraints, WBS) |
| **[ProjectLibre](https://www.projectlibre.com/)** | Open-source scheduling model we deliberately mirror (ASAP, links, calendars) |
| **[MPXJ](https://www.mpxj.org/)** | Industry-standard read path for Project files ([FAQ](https://www.mpxj.org/faq/)) |
| **[DHTMLX Gantt](https://dhtmlx.com/docs/products/dhtmlxGantt/)** | Interactive Gantt chart in the UI |
| **MSPDI (Microsoft Project XML)** | Official XML interchange Project and ProjectLibre already share |
| **OLE Compound Document** | Container format used by classic `.mpp` (same family as old `.doc` / `.xls`) |

### Sample plans used in tests

Integration tests open **10 real `.mpp` files**, not toy stubs:

- Practice files from ***Microsoft Project 2013 Step by Step*** (O’Reilly / Microsoft Press, ISBN [9780735669116](https://resources.oreilly.com/examples/9780735669116-files))
- A **Project Online** export from [MPXJ issue #443](https://github.com/joniles/mpxj/issues/443)

Re-download fixtures:

```bash
npm run mpp:fixtures
```

Details: [`testdata/mpp/README.md`](testdata/mpp/README.md).

---

## Architecture (for the curious)

CLEAN layers, no framework spaghetti:

```
src/domain          entities, calendars, scheduling & cost rules
src/application     use cases, ports, project refresh pipeline
src/infrastructure  MSPDI / MPP / MPX codecs, PDF, HTTP converters
src/presentation    React UI, ribbon, Gantt, sheets
server/             Hono API — .mpp ↔ MSPDI (Java MPXJ + OLE writer)
```

Coverage gate: **≥ 80%** via Vitest.

---

## Docker

```bash
docker compose up --build
```

App: **http://localhost:8080** (UI + MPP API + OpenJDK converter).

---

## License & trademarks

SuperGantt is an independent project. **Microsoft Project** is a trademark of Microsoft Corporation. **ProjectLibre**, **MPXJ**, and **DHTMLX** are trademarks of their respective owners. SuperGantt is not affiliated with or endorsed by them.

---

*Plan loud. Ship quiet. Keep the `.mpp`.*
