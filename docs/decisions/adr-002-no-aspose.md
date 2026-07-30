# ADR-002 — Do not use Aspose

## Status

Accepted.

## Context

Aspose.Tasks (or similar) could accelerate `.mpp` write. The owner explicitly forbade Aspose (“без Aspose. Сам напиши все”) after exploring clean-room / OLE options.

## Decision

No Aspose dependency for read/write. Implement conversion and writing in-repo (MPXJ-based Java tools, OLE writer, templates).

## Consequences

- More engineering ownership of brittle binary formats.
- Must keep fixture tests green as the writer evolves.
- Licensing simplified for a free end-user app.
