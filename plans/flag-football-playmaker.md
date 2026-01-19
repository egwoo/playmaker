# Flag Football Playmaker MVP

Brief overview of task / feature / project
Build a static, GitHub Pages-friendly app for drawing and animating flag football plays with local persistence.

## Goals
- Add offense/defense players on a field canvas and set a single destination with a duration.
- Play/pause and scrub the timeline to watch the play animate.
- Persist and restore the play state with localStorage.
- Work on desktop and mobile (pointer events, responsive layout).

## Non-Goals
- Multi-segment routes, option routes, or timing trees.
- Ball logic (handoff/pass) and possession tracking.
- Defense strategies (man/zone) and assignments.
- Cloud sync or sharing.

## Implementation Plan

### Phase 1: Scaffold + Core Model (testable)
[x] Scaffold Vite + TypeScript + Vitest with GitHub Pages base config.
[x] Write model tests for interpolation, duration, and serialization.
[x] Implement model utilities to pass tests.

### Phase 2: Canvas Rendering + Interactions (testable)
[x] Render field, line of scrimmage, and player markers on canvas.
[x] Implement pointer interactions: add/select/set destination/delete.
[x] Add playback controls with scrubber and play/pause behavior.

### Phase 3: Persistence + UX Polish (testable)
[x] Save/load play state to localStorage with reset option.
[x] Make layout responsive and usable on mobile.
[x] Style UI with a clear visual direction and helpful labels.

### Phase 4: Multi-Waypoint Routes + Undo/Redo (testable)
[x] Update play model to support multi-leg routes with per-leg durations and legacy migration.
[x] Add UI for waypoint list editing and default duration for new waypoints.
[x] Add canvas interactions for adding and dragging waypoints.
[x] Add undo/redo controls for play edits.

### Phase 5: Ball Logic + Passing (testable)
[x] Add per-leg ball actions (handoff/pass) with a global ball speed.
[x] Compute ball position over time with interception logic.
[x] Render a football sprite with a pass arc/trail.

### Phase 6: Man Coverage Defense (testable)
[x] Add per-defender man coverage assignment with default speed.
[x] Simulate defender movement with a coverage radius + max speed.
[x] Add UI for selecting coverage assignments and defender speed.

### Phase 7: Zone Defense (testable)
[x] Add per-defender zone coverage with ellipse bounds and default size.
[x] Add UI for zone sizing and coverage type toggle.
[x] Render zone ellipses on the field.

## Open Questions
- None yet.

## Decision Log
- Start with a single destination per player and a single duration per move.
- Extend to multi-leg routes with per-leg durations and waypoint editing.
- Switch per-leg timing to speed (yards/second) instead of duration.
- Ball actions live on waypoints with a fixed ball speed and interception logic.
- Add optional start action (time zero) for snaps/handoffs.
- Man coverage: per-defender assignment, 1-yard coverage radius, default speed 6 yd/s with per-defender override.
- Zone coverage: per-defender mode with 10 yd horizontal / 5 yd vertical ellipse and per-defender speed.
- Remove defender routes; coverage is always man or zone (no "None"), and zone radii are draggable.
