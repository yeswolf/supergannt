# 07 — Bugfixes, regressions, and invariants

This chapter records **confirmed failure modes** from the product chats and the **invariants** that MUST hold afterward. Treat each subsection as a regression contract.

---

## 1. Network Diagram blank / frozen

### Symptom

Network view shows nothing useful / UI hangs when opening Network.

### Root cause

`useLayoutEffect` depended on `nodes` / `edges` arrays returned by `toNetworkDiagram(project)`. Those arrays are **new references every render**. The effect called `setEdgeGeoms` / `setSize` → re-render → effect → infinite update loop. React effectively killed the view.

### Invariant (MUST)

- Layout/measure effects MUST NOT list fresh `toNetworkDiagram` array identities as dependencies.
- Use stable keys derived from project id + node/edge identities, refs for current edges, and equality-guarded state updates.
- Component tests MUST render Network without throwing and show task nodes for the demo/workspace project.

### Related later fix

Arrow routing replaced naive straight lines; see §2.

---

## 2. Network arrows cross the whole grid on wrap

### Symptom

When a dependency “hits the right edge” and continues to a node on the next visual row/column wrap, the arrow draws a long chord through unrelated cards.

### Root cause

Square CSS grid (`ceil(sqrt(n))`) + straight SVG lines between side anchors.

### Invariant (MUST)

- Layout by **dependency layers** (longest-path layering): successors sit to the right of predecessors.
- When layers exceed columns that fit the viewport, continue on a **new vertical band** (`placeNetworkBoxes` / `networkColumnsThatFit`).
- Edges are **orthogonal** polylines.
- Reverse/wrap edges use a **floor lane under the diagram**, never a diagonal through the node field.
- Unit tests cover forward elbow, band wrap placement, and wrap-under-floor routing (`routeLink`, `computeNetworkLayers`, `placeNetworkBoxes`).

---

## 3. Task Information OK does not keep duration hours

### Symptom

User changes Duration (hours) on General, presses OK — hours revert.

### Root cause

`applyAllTabs` always re-applied Resources via `setTaskAssignments`, which **recreated** assignments (`workHours: 0`) and ran effort-triangle recalc using **old** assignment work shares → duration snapped back. Order was General → … → Resources after duration write in some paths; even with General after Resources, no-op recreation was dangerous.

### Invariants (MUST)

1. `setTaskAssignments` is a **no-op** when the multiset of `{resourceId, units}` is unchanged (do not recreate ids / do not recalc).
2. Task Info OK apply order is: **Advanced → Resources → General → Predecessors**.
3. Regression tests in `TaskInfoOk.test.ts` assert duration **40h / 24h** survives an OK-style sequence with unchanged resources.

---

## 4. FS / “после” dependency does not shift the successor

### Symptom

User sets predecessor relationship meaning “after” (FS). Successor bar does not move after predecessor finish. Especially visible when confirming via Task Information OK.

### Root causes (compound)

1. Soft constraints (e.g. **SNLT** at current start) blocked FS push-out unless cleared on link.
2. Task Info OK applied **Advanced after Predecessors**, re-writing SNLT/SNET onto the task **after** `withLinkDrivenSuccessor` had cleared them → schedule stayed pinned.

### Invariants (MUST)

1. Creating/updating predecessor links clears soft pins to ASAP (hard MSO/MFO kept) — `withLinkDrivenSuccessor`.
2. Predecessors apply **last** in Task Info OK.
3. After FS link, successor start equals calendar `snapToWorkStart(pred.finish)` (+ lag), and is later than pre-link start when both shared the same former start.
4. Covered by `FsSuccessorReschedule.test.ts` and `TaskInfoOk.test.ts`.

---

## 5. Packaged exe shows 404

### Symptom

After installing / launching SuperGantt.exe, window loads a 404 page.

### Root cause

Boot attached to port **8787** (or similar) where something answered `/api/health` but did **not** serve the SPA static UI (dev API-only, zombie health stub, etc.).

### Invariants (MUST)

- Port is **ready** only if health **and** HTML UI are present.
- Otherwise spawn own server with `SUPERGANTT_STATIC_ROOT` or pick another free port.
- Probe timeouts prevent infinite wait.
- Failure → error dialog, not a blank/404 shell as success.
- Pack staging verifies `ui/index.html` exists.

---

## 6. Installer build fails on icon (“invalid icon file size”)

### Symptom

`makensis` aborts while loading `build/icon.ico`.

### Root cause

Malformed / oversized / non-standard ICO produced by naive conversion (e.g. single huge PNG-in-ICO NSIS rejects, or corrupted redirect writes).

### Invariants (MUST)

- Ship a multi-resolution ICO (16, 24, 32, 48, 64, 128, 256) built by a known-good writer (`scripts/make-ico.mjs` embedding PNG+alpha).
- Re-pack after icon changes; do not hand-wave pack failures.

---

## 7. App icon black corners

### Symptom

Desktop / installer icon shows a blue rounded tile inside a **black square**.

### Root causes

1. Source artwork had an opaque black plate outside the squircle.
2. ICO writer flattened transparency to black (no PNG alpha entries).

### Invariants (MUST)

- Corner pixels outside the rounded mask have **alpha = 0**.
- ICO contains embedded PNG chunks with alpha (verify magic `89 50 4E 47` appears once per size).
- Favicon SVG uses transparent viewport outside rounded rect (no black rect backdrop).

---

## 8. Loader / openPlanFile flakiness

### Symptom

Opens appear to no-op in tests or rare races; busy overlay clears incorrectly on overlapping opens.

### Invariants (MUST)

- Single-flight open with generation/token; clear busy in `finally`.
- `FileReader` fallback when `File.text` missing.
- Test helper to reset open state between cases.

---

## 9. Histogram equal heights

### Symptom

All usage histogram columns same height.

### Invariant (MUST)

Height `∝ hours / maxScale` with non-stretching layout (`align-items: flex-end` or equivalent).

---

## 10. Enter vs OK

### Invariant (MUST)

Enter in Task Information / Assign Resources (except textarea/button/IME composing) triggers the same save path as OK.

---

## 11. Process regressions

### Fake “background agents”

Claiming agents restarted is insufficient. MUST verify:

- tests pass, or
- files changed, or
- foreground agent completion artifacts.

### Coverage theater

MUST NOT shrink `coverage.include` to exclude UI and then claim “80% of all code.” Owner asked for **≥80% of all application source**.
