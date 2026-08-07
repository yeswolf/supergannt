# Create a God

## Overview

Add a `God` domain entity to the SuperGantt domain model. The God entity represents a divine overseer within the project management domain — a playful addition that follows the same entity pattern as `Task`, `Resource`, `Project`, etc.

## User Story

As a project manager with delusions of grandeur, I want to assign a deity to watch over my project so that I may receive divine blessings on my timeline.

## Acceptance Criteria

1. A `God` entity exists at `src/domain/entities/God.ts` following the project's entity pattern (`create` factory, getters, `with()`, `toProps()`).
2. A `GodId` branded type and `asGodId` constructor are added to `src/domain/value-objects/Ids.ts`.
3. Basic invariants are validated: name is required (non-blank), domain must be one of the recognized domains of influence.
4. The entity has at minimum: `id`, `name`, `domain` (e.g. "sky", "sea", "wisdom", "craftsmanship", "project management"), `benevolence` (0–100), and `isPleased` (boolean, derived when benevolence ≥ 50).
5. Tests are added to `src/domain/entities/entities.test.ts` covering creation, validation, and `with()`.
6. `npm test` passes from the repository root.

## Technical Notes

- Follow the existing entity pattern exactly: branded `string & { readonly __brand: ... }` ID type, `private constructor`, `static create`, `with(patch)`, `toProps()`.
- Keep the tone lighthearted and inclusive — this is a fun feature, not a theological statement.
- Never merge (per issue directive).