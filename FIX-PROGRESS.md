# Fix progress: editors (floor-plan editor, templates, event layouts, seating)

Branch: `fix/editors`

| Id | Status | Note |
|----|--------|------|
| B65 | done | `countSeats` counts round tables by `chairs` and adds standalone chairs, matching the editor. |
| B109 | done | `csvCell` defuses `= + - @ \t \r` values with a leading apostrophe before quoting. |
| B66 | done | Guest CSV import decodes strict UTF-8, else Windows-1250 (and UTF-16 with BOM), so names and the Poznámka column survive. |
| B27 | done | Applying a template asks first, keeps the guest list (re-seats guests whose table id + chair, or standalone chair, still exists; `floorplan-layout.ts`), reports what happened and offers Undo. |
| B31 | done | Staff `loadTemplate` uses the same owner/admin-or-own-and-live gate as `saveLayout`. |
| B69 | done | Template id and current layout go in the enhance `formData` (no stale hidden input); failures are shown. |
| B28 | done (editor side) | Hall and event editors rebuild when the draft in the URL changes on client-side navigation; MapEditor `autosave` prop stops step-change saves of drafts. "Applied" bookkeeping is the AI team's. |
| B63 | done | `LayoutSaver` + `guardUnsaved` (src/lib/editor/layout-saver.svelte.ts): in-app navigation waits for the save, tab close prompts and sends a keepalive save; used by hall, template, staff and client editors. A freshly opened plan is no longer marked unsaved. |
| B111 | done | Floor-plan autosave sends a content hash of the plan it started from; the server refuses (409) a save over a newer plan, the editor stops autosaving and offers "load newer" or "overwrite". No migration needed. |
| B54 | done | Client layout honours `custom_layouts` off / `force_layouts` on: guests-only "seating" mode, tables locked in the editor, and `saveLayout` refuses any furniture change (`arrangementKey`). Template switching stays allowed. |
| B61 | done | Client sees a client-appropriate message when the hall has no table types; client editor no longer overflows the window (takes back the site column padding, 100dvh). |
| B68 | done | MapEditor change effect reads `floors` tracked, so a rename is reported and saved. |
| B141 | done | Shift+1 matched by `e.code`; checkboxes/radios/buttons no longer count as typing; "(experiment)" dropped from the label. |
| B142 | done | Chair fields show the capped value; legend moved below the instruction bar; room notices clear on tool/step change; a room part wholly inside the room is refused (`rectCovered`). |
| I25 | done | Zones from the hall plan (`hallZoneIds`) are locked in template and event editors (no select/drag/reshape/erase/delete/context menu). UI-level; the server does not re-check zones. |
| I3 | done | Tables carry a stable `num` (assigned on load and on placement/duplication, `tableNumbers` in floorplan-layout.ts); canvas shows T3 + label, seat chips "T3 · miesto 2", manifest/CSV/print use the same numbers. |
| M13 | done | Printable hall floor plan (`/app/manage/halls/[id]/editor/print`) and template (`…/templates/[templateId]/print`) via `PlanPrintDoc`, linked from the editors' check step; manifest prints zone labels on the plan, table notes (list + roster rows). Root layout renders these print routes without the app shell (one-line change in src/routes/+layout.svelte). |
| B67 | done | Below 760 px the editor shows a read-only plan per floor with a "needs a bigger screen" note instead of a 0-px canvas; editor toolbars wrap. |
| I23 | done | Pillar size and square/round options (round = 24-gon wall); width/depth fields for a selected axis-aligned wall (thickness); live length of the side being drawn; measurement labels placed by priority without overlapping (`label-layout.ts`). |
| I24 | done | Re-import skips guests already on the list (name + group) and says who; export headers localised, `;` for Slovak. |

Foreign file: `src/routes/+layout.svelte` (shell team) — `isDocPage` also matches the two new print routes.
No migration was needed (B111 compares a content hash of `halls.floorplan_json`).

Checks at the end: `npx vitest run` 33 files / 293 tests pass; svelte-check 0 errors.
Not verified in a browser (per instructions): the narrow view, label placement, the print sheets and the client editor height.
