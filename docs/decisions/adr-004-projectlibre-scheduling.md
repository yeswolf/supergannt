# ADR-004 — ProjectLibre as scheduling semantics reference

## Status

Accepted.

## Context

Functional parity target: “all the same functions as ProjectLibre” for planning behavior (links, calendars, effort rules, views inventory), while UI chrome trends toward modern MS Project / Fluent.

## Decision

- When behavior is ambiguous, **prefer ProjectLibre rules** for scheduling, calendars, effort triangle, link-driven ASAP, milestone zero-duration, predecessor notation.
- UI may differ visually but must expose the same *capabilities*.

## Consequences

- Domain services encode ProjectLibre tables explicitly (`EffortScheduling`, constraints, FS successor clearing soft pins).
- “Looks pretty but schedules wrong” is a P0 bug.
