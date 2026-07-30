# 02 — File formats and interoperability

## 1. Formats matrix (MUST)

| Format | Open | Save | Requirement notes |
|--------|:----:|:----:|-------------------|
| `.mpp` / `.mpt` | MUST | MUST | Real MS Project binary (OLE). Native Project must open saved `.mpp`. |
| MSPDI `.xml` | MUST | MUST | Official interchange with Project & ProjectLibre. |
| `.mpx` | optional / export | MUST export | Classic exchange. |
| PDF | — | MUST export | Printable plan snapshot (task table / report). |

## 2. Opening plans (MUST)

1. User can open plans via:
   - Ribbon **Open…**
   - Drag-and-drop onto the app shell
2. Opening MUST always show a **busy loader** for the full read+parse path (large plans exist). Status text like `Opening {filename}…`.
3. Overlapping opens MUST be ignored or serialized so the loader is not cleared early by a second open.
4. Binary `.mpp`/`.mpt` read via `arrayBuffer`; text formats via text read with a **`FileReader` fallback** when `File.text()` is missing (jsdom / some runtimes).
5. Failures surface a clear status message; loader clears in `finally`.

## 3. Saving `.mpp` — hard requirements

### 3.1 Native Project compatibility (MUST)

- Saved `.mpp` MUST be openable by **native Microsoft Project**.
- A “custom SuperGantt-only container” is **not** acceptable as the answer to “save mpp”.

### 3.2 Unchanged identity (MUST)

- If the user opens an `.mpp` and saves **without edits**, the written file MUST be **byte-identical** to the source.
- Verification MUST compare **raw binary bytes**, not “re-open in our app and compare object models”.
- This is covered by fixture tests over the real MPP corpus.

### 3.3 After edits (MUST)

- After edits, writer produces a Project-style OLE `.mpp` (semantic round-trip tested where identity cannot hold).

### 3.4 Implementation constraints from chat

- Research ProjectLibre / MPXJ write paths; OLE compound approach is acceptable if cross-platform in *our* stack (Java converter), without requiring Windows MS Project Automation as the only method.
- **Aspose is forbidden** as the solution.
- Prefer implementing/owning the write path in-repo (server Java + templates) rather than a paid SDK.

## 4. MPP conversion runtime (MUST)

- Conversion runs through the server API (Hono) using `mpp-convert.jar` (MPXJ-based / project Java tools).
- **JDK/JRE 17+ discovery**:
  - Search the machine for a suitable Java.
  - If missing at packaged app runtime: download **Eclipse Temurin** (or equivalent agreed JRE) into an app runtime folder (`server/.runtime` in dev, `%APPDATA%\supergannt\runtime` on desktop).
- `npm run mpp:setup` builds/fetches converter artifacts for developers.
- Headless/native-image AWT issues (e.g. `UnsatisfiedLinkError: No awt`) MUST be handled so open works in server environments (headless flags / build configuration as required).

## 5. Test corpus (MUST)

- Maintain **≥ 10 real, complex `.mpp` fixtures** (not toys).
- Sources used historically: Microsoft Project Step by Step practice files; Project Online sample from MPXJ issues; etc. See `testdata/mpp/README.md`.
- Tests MUST:
  - open each fixture;
  - round-trip / identity-save where required;
  - semantic identity where binary identity cannot apply after rewrite.

Commands:

- `npm run mpp:fixtures` — refresh fixtures.
- Vitest suites under `src/infrastructure/mpp/`.

## 6. PDF export (MUST)

- Export PDF from the File ribbon.
- Produces a downloadable blob; usable as a snapshot for stakeholders.

## 7. Non-functional

- Large files: loader mandatory (see UI requirements).
- Errors from Java converter must surface readable messages to the UI status bar / dialogs.
