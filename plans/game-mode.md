# Game Mode Toggle

Introduce a Game Mode vs Design Mode toggle that switches the play panel into a play list view and locks the field to view-only.

## Goals
- Add a Design/Game mode toggle under the playbook dropdown.
- Game Mode shows a list of plays (single tap loads the play).
- Game Mode forces view-only on the field.
- Remember the last selected play per playbook and default to it.

## Non-Goals
- Redesigning play metadata, sharing, or playbook permissions.
- New backend behavior.

## Implementation Plan

### Phase 1: Mode toggle + view-only lock
[x] Add the mode toggle UI under the playbook dropdown.
[x] Introduce `playMode` state and make Game Mode force view-only.
[x] Hide edit-only UI (play actions, saved play menus) in Game Mode.

### Phase 2: Game play list + last selection
[x] Render play list buttons in Game Mode.
[x] Persist last selected play per playbook in localStorage.
[x] Default to last selected play on load.

## Manual Test Plan
1. In Design Mode, confirm current UI behavior remains unchanged.
2. Switch to Game Mode:
   - Play list shows.
   - Field is view-only (no adding/moving players/waypoints).
   - Play actions (New/Flip/Save, play menu) are hidden.
3. Select a play in Game Mode:
   - The play loads and renders.
4. Reload the page with the same playbook:
   - The last selected play loads by default.
5. Switch back to Design Mode:
   - Field edit lock returns to the previous state.

## Open Questions
- None.

## Decision Log
- Use localStorage to persist last selected play per playbook.
