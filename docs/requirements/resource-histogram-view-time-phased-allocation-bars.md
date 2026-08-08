## Overview

Add a Resource Histogram view showing time-phased allocation bars per resource.
SuperGantt already computes resource utilization as a text list in the Reports view, but PMs think in time, not in aggregate percentages. A stacked bar chart showing each resource's allocated hours per day/week across the project timeline is the standard tool for spotting *when* overallocations occur.

## User story

As a resource manager reviewing next month's allocations, I want to open a Resource Histogram that shows each resource as a colored row of stacked daily or weekly bars, with overallocations highlighted in red, so that I can scroll through the timeline and immediately see which weeks are overloaded for which people.

## Acceptance criteria

1. **View:** A new "Resource Histogram" view accessible from the view switcher (alongside Gantt, Task Sheet, Resources, etc.).
2. **Chart layout:** Horizontal bars per resource (name on left axis). X-axis is the project timeline (default: week scale, configurable to day or month). Bar height represents allocated hours or % of max units for that period.
3. **Overallocations:** Bars where allocated > max units are rendered in a distinct color (red/orange) with a subtle pattern or border. Hovering shows a tooltip: "Jane: 60h allocated / 40h capacity (150%), tasks: …"
4. **Time scale:** Configurable: day, week, month. Defaults to week. Navigation: scroll wheel zooms in/out; drag pans left/right.
5. **Resource filter:** A dropdown or search field filters which resources are shown. Default: all resources. Multi-select to compare specific resources side by side.
6. **Interaction with leveling:** After resource leveling (#39), the histogram view refreshes to show the post-leveling allocation. A "before" snapshot is stored so the Leveling preview dialog can show a before/after histogram comparison.
7. **Performance:** Computing the histogram for a 500-task, 20-resource plan across a 6-month period at week granularity completes in <100ms.
8. **Tests:** Unit tests for the histogram data computation; component test verifying overallocated bars get the correct style.

## Technical notes

- New function `computeResourceHistogram(project, granularity)` → `Map<ResourceId, PeriodBucket[]>` in `application/services/ReportingService.ts`.
- Each `PeriodBucket` contains: period start date, allocated hours, capacity hours (max units × working hours in period), and list of task IDs contributing.
- New component `ResourceHistogramView.tsx` implemented as custom HTML/CSS chart using CSS Grid.
- Reuse time-scale logic from `GanttZoomLevels.ts` for X-axis ticks.
- Follow view-switcher pattern in `nav/views.ts`.
- Theme colors: `--histogram-ok`, `--histogram-overallocated`, `--histogram-capacity-line` in `themes.css`.
