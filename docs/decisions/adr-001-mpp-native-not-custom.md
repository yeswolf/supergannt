# ADR-001 — Native Microsoft Project `.mpp`, not a custom format

## Status

Accepted (reinforced repeatedly in product chat).

## Context

`.mpp` is proprietary. Early suggestions included custom containers, XML-only interchange, or “OLE is Windows-only so give up.” The owner rejected any outcome where “saved mpp” is not openable by **native MS Project**.

## Decision

- Open and save **real** `.mpp` / `.mpt` binaries.
- Unmodified save ⇒ **byte-identical** to source (binary compare).
- Edited save ⇒ Project-openable OLE `.mpp` (plus MSPDI/MPX/PDF as additional formats).

## Consequences

- Requires Java/MPXJ (or equivalent) read path and a maintained write path (template OLE + field mapping).
- Heavier desktop/server runtime (JRE discovery/download).
- Fixture corpus and round-trip tests are mandatory.
