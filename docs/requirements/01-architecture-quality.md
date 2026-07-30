# 01 — Architecture, libraries, and quality

## 1. CLEAN architecture (MUST)

The codebase MUST remain layered. Violations are bugs, not style nits.

### 1.1 Layers

| Layer | Path | Allowed to know | Must not know |
|-------|------|-----------------|---------------|
| Domain | `src/domain` | Itself | Application, infrastructure, React, HTTP, file codecs as frameworks |
| Application | `src/application` | Domain, ports | React components, concrete HTTP/Electron details (only via ports) |
| Infrastructure | `src/infrastructure` | Domain, application ports | Presentation |
| Presentation | `src/presentation` | Application use-cases / workspace façade | Direct low-level codec hacks when a use-case exists |
| Server | `server/` | Conversion / API concerns | Domain UI state |

### 1.2 Rules

- Business scheduling rules live in **domain services** (e.g. `SchedulingService`, `EffortScheduling`, calendars, milestone policy).
- Mutations go through **use cases** (`TaskUseCases`, `DependencyUseCases`, `ResourceUseCases`, …) then `refreshProject` / schedule.
- UI dispatches **workspace actions**; reducer calls use cases — UI must not reimplement scheduling math.
- Prefer ports/adapters for file open/save and ID generation.

## 2. Libraries policy (MUST / SHOULD)

### 2.1 Prefer ready libraries

MUST maximize reuse for:

- UI framework (React)
- Gantt (DHTMLX Gantt)
- HTTP API (Hono)
- XML (fast-xml-parser or equivalent)
- PDF (jsPDF / autotable)
- Test runners (Vitest, Testing Library)
- Desktop shell (Electron + electron-builder)

### 2.2 When a library is missing

If no acceptable library exists for a MUST feature (historically: writing Project-native `.mpp` without Aspose):

1. Research options (MPXJ, ProjectLibre write path, OLE compound, clean-room).
2. Choose an approach that produces **MS Project–openable** files.
3. Document the decision in `docs/decisions/`.
4. Cover with fixture tests.

**Rejected:** Aspose as a dependency for this product (user veto).

## 3. Code quality expectations

- TypeScript throughout application code.
- No “god components” that own scheduling.
- UI may be modern/Fluent, but domain stays framework-agnostic.
- Comments only where behavior is non-obvious (e.g. Task Info OK tab order, Network layoutKey infinite-loop hazard).

## 4. Testing and coverage (MUST)

### 4.1 Minimum coverage

- **≥ 80%** for **statements, branches, functions, and lines**.
- Scope: essentially **all of `src/**/*.{ts,tsx}`** used by the app (not a narrow domain-only include that hides UI debt).
- Allowed excludes (examples): `*.test.*`, `src/test/**`, entry shells like `main.tsx` / `App.tsx`, pure port interfaces, type-only modules — as configured in `vitest.config.ts`.
- MUST NOT lower thresholds to pass CI.

### 4.2 What to test

- Domain scheduling & effort triangle.
- Use cases (link, assign, update duration, calendars).
- Codecs / MPP open + identity save + semantic round-trip.
- Workspace reducer flows that mirror Task Information OK.
- Critical UI regressions (Network render, ribbon commands) with Testing Library where valuable.

### 4.3 Verification gate before packaging

Standing order from product owner:

> Always verify **(a) tests** then **(b) build** before producing installers / claiming done.

Practical sequence:

1. `npm test` (or targeted suite while iterating, full suite before pack).
2. `npm run build` (or the pack script which builds UI).
3. `npm run desktop:pack` when an installer is requested.

## 5. Multitasking / agent workflow (process SHOULD)

When many independent workstreams exist (loader, FS shift, Network arrows, exe 404, coverage):

- Prefer **parallel agents / multitask**.
- Background agents that do not actually start must be **re-run in foreground** and verified by artifacts (tests, files, UI), not by claimed IDs alone.
- After parallel work: **reconcile** conflicts (especially shared files like `NetworkView`, `vitest.config`, `openPlanFile`).

## 6. Repository hygiene

- User-facing README in English with references and how to run.
- Publish / keep GitHub in sync when asked.
- Do not commit secrets.
- Large binaries (JDK runtime, release artifacts) stay out of git as appropriate; fixtures under `testdata/` are intentional.
