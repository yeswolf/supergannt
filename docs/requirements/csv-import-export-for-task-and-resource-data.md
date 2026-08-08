# CSV Import/Export for Task and Resource Data

## Overview

Add CSV import and export for task and resource data to SuperGantt. Export writes the current Task Sheet or Resource Sheet to UTF-8 CSV with BOM. Import reads a CSV file, auto-detects delimiter and encoding, lets the user map CSV columns to SuperGantt fields, and appends the imported rows to the current project as a single undoable step.

## User Story

As a PM onboarding a 200-task plan from a Jira export, I want to drag a CSV onto SuperGantt, map its columns (Name, Start, Finish, Duration, Resource) to task fields, and have the tasks created with proper WBS hierarchy and dependencies inferred from outline levels, so that I can be editing in the Gantt within 30 seconds instead of retyping every task by hand.

## Acceptance Criteria

1. **CSV export — Task Sheet:** File > Export > CSV (Tasks) exports all tasks as UTF-8 CSV with BOM. Columns match the current Task Sheet column configuration. Summary tasks, milestones, WBS, start, finish, duration, % complete, predecessors, resource names, and cost are included.
2. **CSV export — Resource Sheet:** File > Export > CSV (Resources) exports resources with name, type, group, max units, standard rate, overtime rate, cost per use, calendar, and notes.
3. **CSV import:** File > Import > CSV opens an import dialog. User selects a CSV file, and the app auto-detects the delimiter (comma, tab, semicolon) and encoding. A column-mapping step shows a preview grid: CSV columns on the left, SuperGantt task/resource fields on the right. User drags or selects mappings.
4. **Import supports:** Task fields (name, start, finish, duration, % complete, WBS, outline level, notes, priority, milestone flag, constraint type/date, fixed cost) and Resource fields (name, type, group, max units, standard rate, notes). Unmapped columns are ignored with a warning.
5. **Import result:** Imported tasks/resources are appended to the current project (not replace). A summary shows rows imported, rows skipped (validation errors), and a link to scroll to the first new task. The operation is a single undoable step.
6. **Validation:** Rows with missing names are skipped and reported. Date parsing handles ISO 8601, US (MM/DD/YYYY), and EU (DD/MM/YYYY) formats, configurable in the import dialog.
7. **Performance:** Importing 1000 tasks from CSV completes in <3 seconds.
8. **Tests:** Round-trip test: export tasks to CSV, re-import into a blank project, verify tasks match.

## Technical Notes

- Implement a new `infrastructure/csv/CsvCodec.ts` (parallel to existing `MspdiCodec.ts`, `MpxCodec.ts`, `MppCodec.ts`).
- Use the built-in `TextDecoder` for encoding detection (UTF-8, UTF-16 LE/BE, windows-1252) — no new dependency.
- The column-mapping UI: a new `CsvImportDialog.tsx` component with two-column layout (source → target).
- Export uses direct entity iteration. BOM (`﻿`) at the start of the file ensures Excel opens UTF-8 CSVs correctly on Windows.
- Import creates tasks/resources via a bulk-creation path to avoid N individual undo entries. The entire import is one undoable command.
- Predecessor notation during import: accept `1FS`, `2FS+3d`, `3SS-4h` — the same format already parsed by `PredecessorNotation.ts`.
