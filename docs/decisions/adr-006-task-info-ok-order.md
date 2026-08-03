# ADR-006 — Task Information OK apply order

## Status

Accepted (after production bugs on duration + FS shift).

## Context

OK must apply all tabs. Naive order (General → Predecessors → Resources → Advanced) caused:

- Resources recreation to overwrite duration via effort recalc;
- Advanced soft constraints to overwrite link-driven ASAP after FS assign.

## Decision

Fixed apply order on OK / Enter:

1. Advanced (skipped when General includes a **Start** move — ASAP must not fight SNET)
2. Resources  
3. General (non-date fields)
4. Predecessors  
5. **Start / Finish last** — `updateTask({ start })` chooses later→SNET / earlier→MSO so the bar moves and FS successors cascade

Plus: `setTaskAssignments` no-op when assignment multiset unchanged; `setPredecessorLinks` does not clear soft pins when the predecessor rows are unchanged.

## Consequences

- Documented in `requirements/03-scheduling.md` and `requirements/04-ui-ux.md`.
- Tests in `TaskInfoOk.test.ts`, `StartEarlier.test.ts`, and related workspace/dialog suites lock the contract.
- Future tabs must be inserted thoughtfully relative to this order (schedule-driving tabs last).
