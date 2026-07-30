# ADR-005 — Coverage ≥80% over all application `src`

## Status

Accepted.

## Context

Early Vitest coverage included mainly domain/application/infrastructure and excluded presentation, which made “80%” easy while UI remained untested. Owner required multitask work to ensure **≥80% of all code**.

## Decision

- `vitest.config.ts` coverage `include` covers `src/**/*.{ts,tsx}` with narrow excludes (tests, entry, ports, types).
- Thresholds stay at 80 for statements/branches/functions/lines.
- Do not game the include list.

## Consequences

- More Testing Library surface tests.
- Slower test suite acceptable relative to confidence.
