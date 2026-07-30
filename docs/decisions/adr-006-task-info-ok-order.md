# ADR-006 — Task Information OK apply order

## Status

Accepted (after production bugs on duration + FS shift).

## Context

OK must apply all tabs. Naive order (General → Predecessors → Resources → Advanced) caused:

- Resources recreation to overwrite duration via effort recalc;
- Advanced soft constraints to overwrite link-driven ASAP after FS assign.

## Decision

Fixed apply order on OK / Enter:

1. Advanced  
2. Resources  
3. General  
4. Predecessors  

Plus: `setTaskAssignments` no-op when assignment multiset unchanged.

## Consequences

- Documented in UI + regression requirements.
- Tests in `TaskInfoOk.test.ts` lock the contract.
- Future tabs must be inserted thoughtfully relative to this order (schedule-driving tabs last).
