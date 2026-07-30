<p align="center">
  <img src="public/app-icon.png" alt="SuperGantt" width="96" height="96" />
</p>

<h1 align="center">📊 SuperGantt</h1>

<p align="center">
  <strong>A modern project planner that speaks Microsoft Project</strong><br/>
  — without the license, the ribbon maze, or the “save as XML and pray” ritual.
</p>

<p align="center">
  <a href="https://github.com/yeswolf/supergannt/releases/latest"><img src="https://img.shields.io/github/v/release/yeswolf/supergannt?style=for-the-badge&color=0f6cbd" alt="Release" /></a>
  <a href="https://github.com/yeswolf/supergannt/releases/latest"><img src="https://img.shields.io/github/downloads/yeswolf/supergannt/total?style=for-the-badge&color=107c10" alt="Downloads" /></a>
  <a href="#-quick-start"><img src="https://img.shields.io/badge/platform-Windows%20·%20Web%20·%20Docker-5b5fc7?style=for-the-badge" alt="Platforms" /></a>
  <a href="#-license--trademarks"><img src="https://img.shields.io/badge/license-independent-8a8886?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <a href="#-screenshots">📸 Screenshots</a> ·
  <a href="#-features">✨ Features</a> ·
  <a href="#-quick-start">🚀 Quick start</a> ·
  <a href="https://github.com/yeswolf/supergannt/releases/latest">💿 Download</a>
</p>

---

Open real **`.mpp`** plans. Edit them in the browser or on the desktop. Schedule like ProjectLibre. Save back as `.mpp`, MSPDI XML, MPX, or PDF.

Built for people who live in Gantt charts — PMs, schedulers, and engineers who want a **fast local tool** that still interoperates with **Microsoft Project** and **ProjectLibre**.

### 💿 Grab the Windows installer

👉 **[Download SuperGantt_1.0.1_x64-setup.exe](https://github.com/yeswolf/supergannt/releases/download/v1.0.1/SuperGantt_1.0.1_x64-setup.exe)** from [Releases](https://github.com/yeswolf/supergannt/releases/latest)

> Slim NSIS install (~31 MB). Portable Node / JRE are fetched on first need into `%LOCALAPPDATA%\SuperGantt\runtime`.

---

## 📸 Screenshots

Sample plan: [`06-advanced-tracking.mpp`](testdata/mpp/06-advanced-tracking.mpp)  
*(screenshots omit recurring “Editorial staff meeting” tasks for clarity)*

<p align="center">
  <img src="docs/screenshots/01-gantt.png" alt="Gantt Chart (week scale)" width="920" />
  <br/><em>📅 Gantt Chart — week scale</em>
</p>

<p align="center">
  <img src="docs/screenshots/02-gantt-month.png" alt="Gantt Chart (month scale)" width="920" />
  <br/><em>🗓️ Gantt Chart — month scale</em>
</p>

<p align="center">
  <img src="docs/screenshots/03-tasks.png" alt="Task Sheet" width="920" />
  <br/><em>📋 Task Sheet</em>
</p>

<p align="center">
  <img src="docs/screenshots/04-resources.png" alt="Resource Sheet" width="920" />
  <br/><em>👥 Resource Sheet</em>
</p>

<p align="center">
  <img src="docs/screenshots/05-network.png" alt="Network Diagram" width="920" />
  <br/><em>🕸️ Network Diagram</em>
</p>

<p align="center">
  <img src="docs/screenshots/06-wbs.png" alt="WBS" width="920" />
  <br/><em>🌳 WBS</em>
</p>

<p align="center">
  <img src="docs/screenshots/07-task-usage.png" alt="Task Usage" width="920" />
  <br/><em>⏱️ Task Usage</em>
</p>

<p align="center">
  <img src="docs/screenshots/08-resource-usage.png" alt="Resource Usage" width="920" />
  <br/><em>📈 Resource Usage</em>
</p>

<p align="center">
  <img src="docs/screenshots/09-calendar.png" alt="Calendar" width="920" />
  <br/><em>📆 Calendar</em>
</p>

<p align="center">
  <img src="docs/screenshots/10-reports.png" alt="Reports" width="920" />
  <br/><em>📑 Reports</em>
</p>

---

## ✨ Features

| | |
|:--|:--|
| 📂 | **Open binary `.mpp` / `.mpt`** — the same files Project opens |
| ✏️ | **Edit** tasks, dates, duration, % complete, WBS, predecessors (`2FS+8h`), resources & assignments |
| 🧠 | **Schedule** ASAP with FS / SS / FF / SF, lag/lead, constraints, critical path & baselines |
| 💾 | **Save** as native **`.mpp`**, MSPDI **`.xml`**, **`.mpx`**, or **PDF** |
| 🖥️ | **Browser** or **desktop** (Tauri / WebView2) |
| 🐳 | Fully offline with **Docker** |

**Views:** Gantt · Task Sheet · Resources · Network · WBS · Usage · Calendars · Reports (incl. earned-value style summaries)

---

## 🚀 Quick start

```bash
npm install
npm run mpp:setup    # once — JDK 17+ + MPP converter JAR
npm run dev
```

Then open **http://localhost:5173** 🎉

| Command | What it does |
|---------|----------------|
| `npm run dev` | 🌐 Web UI + MPP API |
| `npm run tauri:pack` | 📦 Windows installer → `release-tauri/` |
| `npm run docker:up` | 🐳 All-in-one container on port **8080** |
| `npm test` | ✅ Unit + integration tests |

> ☕ **Java / MPP:** On first MPP open the app looks for JDK/JRE 17+. If none is found, it downloads **Eclipse Temurin 21 JRE** into the app runtime folder (`server/.runtime` in dev, or `%LOCALAPPDATA%\SuperGantt\runtime` in the desktop build).
>
> For local development you can still run `npm run mpp:setup` once to build `mpp-convert.jar`.

---

## 📁 Opening & saving files

| Format | Open | Save | Notes |
|--------|:----:|:----:|-------|
| `.mpp` / `.mpt` | ✅ | ✅ | Real MS Project binary (OLE compound) |
| MSPDI `.xml` | ✅ | ✅ | Best interchange with Project & ProjectLibre |
| `.mpx` | — | ✅ | Legacy exchange |
| PDF | — | ✅ | Export snapshot |

💡 **Tip:** If a colleague uses Microsoft Project, MSPDI XML is the safest shared format. SuperGantt can also write `.mpp` for round-trips and native Project files when you need them.

Unchanged plans save **byte-identical** to the `.mpp` you opened. After you edit, SuperGantt rewrites the schedule into a Project-style OLE file.

---

## 🧭 Scheduling, the ProjectLibre way

SuperGantt follows the same mental model as ProjectLibre / MS Project:

- 🕐 Working-time calendars (not naive calendar days)
- 🔗 Predecessors with type + lag (`3SS-4h`)
- 📌 **Start No Earlier Than** when you drag a bar or set a start date
- 📊 Summary tasks roll up from children
- 🔥 Critical path from zero total float

Edit **Start** and **Finish** in the Task Sheet or Task Information dialog — duration recalculates in working hours when you change Finish.

---

## 📚 References & inspiration

| Reference | Role |
|-----------|------|
| **[Microsoft Project](https://www.microsoft.com/microsoft-365/project)** | UX & file-format north star (`.mpp`, MSPDI, constraints, WBS) |
| **[ProjectLibre](https://www.projectlibre.com/)** | Open-source scheduling model we deliberately mirror |
| **[MPXJ](https://www.mpxj.org/)** | Industry-standard read path ([FAQ](https://www.mpxj.org/faq/)) |
| **[DHTMLX Gantt](https://dhtmlx.com/docs/products/dhtmlxGantt/)** | Interactive Gantt in the UI |
| **MSPDI** | Official XML interchange Project & ProjectLibre already share |
| **OLE Compound Document** | Container format used by classic `.mpp` |

### 🧪 Sample plans used in tests

Integration tests open **10 real `.mpp` files**, not toy stubs:

- Practice files from ***Microsoft Project 2013 Step by Step*** (O’Reilly / Microsoft Press, ISBN [9780735669116](https://resources.oreilly.com/examples/9780735669116-files))
- A **Project Online** export from [MPXJ issue #443](https://github.com/joniles/mpxj/issues/443)

```bash
npm run mpp:fixtures   # re-download fixtures
```

Details: [`testdata/mpp/README.md`](testdata/mpp/README.md).

---

## 🏗️ Architecture (for the curious)

CLEAN layers, no framework spaghetti:

```
src/domain          entities, calendars, scheduling & cost rules
src/application     use cases, ports, project refresh pipeline
src/infrastructure  MSPDI / MPP / MPX codecs, PDF, HTTP converters
src/presentation    React UI, ribbon, Gantt, sheets
server/             Hono API — .mpp ↔ MSPDI (Java MPXJ + OLE writer)
```

Coverage gate: **≥ 80%** via Vitest ✅

---

## 🐳 Docker

```bash
docker compose up --build
```

App: **http://localhost:8080** (UI + MPP API + OpenJDK converter).

---

## ⚖️ License & trademarks

SuperGantt is an independent project. **Microsoft Project** is a trademark of Microsoft Corporation. **ProjectLibre**, **MPXJ**, and **DHTMLX** are trademarks of their respective owners. SuperGantt is not affiliated with or endorsed by them.

---

<p align="center">
  <em>📣 Plan loud. Ship quiet. Keep the <code>.mpp</code>.</em>
</p>
