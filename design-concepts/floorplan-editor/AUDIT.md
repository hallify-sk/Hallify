# Floorplan editor: audit and three UI/UX concepts

Reviewed 21 October 2026. Scope: the implementation at the start of this review, including existing page-wrapper changes. No production editor files were changed by this review. Concurrent edits to the editor appeared during validation, so the preview is pinned to the audited component from commit `6a6934f5a0c4a1ac45412b776c7e13670d958536` in `baseline/`. The score applies to that audited version, not to the concurrent refactor.

## Verdict: 6/10

A capable spatial editor with useful constraints and domain-specific seating features. The interface is usable once learned, but it puts too much of that learning on the planner. The largest opportunity is clearer interaction design and more dependable recovery, rather than additional drawing tools.

This is an expert heuristic score, not a measured usability-study result. Source inspection covers the editor and its page wrappers; browser checks use the real component with synthetic sample data. Authenticated server saves, production permissions, real inventory, and real event data were not exercised.

| Dimension | Score | Weight | Reason |
| --- | --- | --- | --- |
| Capability and domain fit | 8/10 | 25% | Multi-floor geometry, constrained inventory, collision checks, independent seats, guest groups, notes, and manual/automatic seating. |
| Tool clarity | 6/10 | 25% | Visible text labels are a good foundation. “Grab,” “Wall painter,” and “Bounds” leave behavior ambiguous; both snapping controls use “Snap.” |
| Workflow and information hierarchy | 6/10 | 20% | Contextual properties and separate guest management help. Room setup, template creation, and event editing have different rules without enough explanation in the editor. |
| Feedback and recovery | 4/10 | 15% | Placement previews, undo/redo, and status hints exist. Several mutation paths bypass undo, and save failure handling is incomplete. |
| Adaptability and accessible operation | 4/10 | 15% | Keyboard escape/finish/delete/history exist. Canvas manipulation is pointer-dependent, sidebars stay fixed, and nested viewport heights can clip the UI. |

Weighted result: 5.9/10, rounded to **6/10**.

## Current flow

1. **Venue owner: hall detail → floorplan editor.** Define the room, its walls, zones, boundaries, and floors. The caller hides tables and standalone chairs. Save is explicit.
2. **Venue owner: hall detail → reusable template.** Arrange venue inventory, standalone chairs, and editable zones on a protected room. Floor addition/removal is hidden. Template name and event-type metadata are edited outside the canvas. Autosave waits 900 ms after changes, with a manual Save option.
3. **Event planner: reservation → layout.** The same protected room and inventory rules apply, with guest management enabled. Templates are searchable/filterable and ranked by event type and seat-count proximity. Template application replaces the event layout. Autosave and manual Save coexist.
4. **Client portal: reservation → layout.** Uses the same component and corresponding restrictions. Printing/manifests, hall table-inventory management, and floorplan service requests belong to adjacent pages, not the editor toolbar.

Relevant callers:

- [Venue editor](../../src/routes/app/manage/halls/[id]/editor/+page.svelte)
- [Template editor](../../src/routes/app/manage/halls/[id]/templates/[templateId]/+page.svelte)
- [Event editor](../../src/routes/app/reservation/[id]/layout/+page.svelte)
- [Client portal editor](../../src/routes/halls/my-reservations/[id]/layout/+page.svelte)

## Complete capability inventory

| Area | Existing behavior to preserve |
| --- | --- |
| Select / move | Select individual tables, walls, zones, and standalone chairs; drag objects; reshape wall/zone vertices. Protected venue geometry is excluded from normal selection and erasing. |
| Wall painter | Click vertices to draw a **filled polygon**, including solid wall footprints and columns. Finish by returning to the first point, Enter, double-click, or Close shape; cancel with Escape or Cancel. It is not a centre-line wall tool. |
| Zone painter | Polygon creation, movement, vertex editing, text label, preset colours, custom colour, deletion. |
| Bounds | Two opposite corners define a rectangular usable area; outside is dimmed; position and dimensions displayed; removal supported. Both dimensions must exceed 0.5 m in the current implementation. |
| Tables | Round and rectangular shapes; venue inventory selection and fixed inventory dimensions; freeform table configuration where unrestricted; label; width/depth or radius; rotation via handle or numeric input. |
| Table seating | Round-table chair count; rectangular top/bottom/left/right chair counts; chair spacing; inventory maximum-chair enforcement; seat assignment summary. |
| Standalone chairs | Place, select, move, delete, assign/unassign a guest. No standalone-chair rotation control is exposed, despite rotation existing in the data model. |
| Removal | Eraser tool; selected-object Delete/Backspace; object-specific delete buttons; boundary removal; floor removal where allowed. |
| Measurement | Two-point distance in metres, restart measurement, Escape to clear; no persisted measurement object. |
| Navigation | Zoom slider (15–200 px/m), cursor-anchored scroll zoom, Alt-drag/middle-button pan, rulers and cursor coordinates. |
| Precision | Grid snapping off/0.25/0.5/1/2 m; independent element snapping and alignment guides; 5° handle rotation increments. |
| Placement rules | Table/chair collision and room-boundary checks; red/valid table previews; inventory shape/dimension restrictions and seat limits. Preserve actual rules, while improving why a position is rejected. |
| Floors | Switch, add, remove, double-click rename; preserve each floor's geometry and seating; current-floor and combined summaries. |
| History | Undo/redo buttons; Cmd/Ctrl+Z, Ctrl/Cmd+Y or Shift+Z; snapshots include floors, guest list, active floor; bounded history. Current coverage gaps are listed below. |
| Guests | Add first/last name; optional family/group with existing-group suggestions; sorted guest list; seating location; notes; remove a guest and clear their seats across floors. |
| Seat assignment | Click table chair or standalone chair; search available guests; assign, clear assignment, show name/group/note; manual reassignment clears other seats across floors. |
| Automatic seating | Group by explicit group or surname; larger groups first; find smallest table fitting a group, otherwise split over tables with remaining seats. Current algorithm acts on current-floor tables. |
| Bulk assignment clearing | Clear current-floor table and standalone-chair assignments. Guest records remain. |
| Persistence / templates | Existing version-2 multi-floor JSON and legacy migration, page-level saves, template selection/ranking and replacement, template metadata, assistant page coordination. |
| Localisation / appearance | SK/EN strings, brand tokens and existing theme support. Concepts are an English, light-theme review surface; production must preserve all locales and themes. |

Audited source of truth: [frozen MapEditor.svelte](./baseline/MapEditor.svelte), [frozen floorplan-types.ts](./baseline/floorplan-types.ts), and [i18n.ts](../../src/lib/i18n.ts). The component snapshot differs only in its floorplan-types import path. Line numbers below refer to this frozen version.

## Findings, with implementation evidence

### 1. Height and panel behavior work against the canvas

`MapEditor.svelte:2294` sets `.app` to `height:100vh`. Page wrappers add their own toolbar, and some also declare `height:100vh`. The child therefore requests the whole viewport inside a smaller slot. In the isolated baseline at 1512 × 982, the map measured 912 px high and extended beyond the viewport. The baseline is not a screenshot of an authenticated page, but the nesting problem is directly reproducible.

The panel is 228 px wide, the tool rail 140 px, and there are no viewport-width responsive rules in this component. Each panel section is independently given `flex:1` plus scrolling, creating several compressed scrolling regions instead of one predictable inspector.

**Design response:** available-height sizing, one inspector scroll container, collapsible inspector, wrapping control bars, and a compact-width inspector overlay. Production also needs touch panning and an accessible non-canvas editing path.

### 2. Labels describe implementation more than intent

The source labels are “Grab,” “Wall painter,” “Zone painter,” and “Bounds.” A user cannot infer that a wall is a filled polygon, or that Bounds defines a rectangular exclusion area. The zone star icon does not communicate an area. Both grid spacing and element alignment use “Snap.”

**Design response:** Select & move, Draw wall, Draw zone, Room boundary, Grid snap, and Align objects. Give every tool a one-line explanation and a persistent next-action hint. Keep existing shortcuts, with visible Finish shape and Cancel controls near the active instructions.

### 3. Undo is not consistently transactional

`updateTable` and `updateZone` (around lines 1232–1263) do not call `pushUndo`. Property-panel deletes (around 2072, 2105, 2139, 2158), guest add/remove/note edits, floor rename, auto-seat, and clear-all also omit a snapshot. The canvas-level selection fallback creates a snapshot, but the SVG table-group handler (around line 1571) stops propagation and starts dragging or erases the table without a snapshot. Browser validation reproduced an existing table moving while Undo remained disabled. Different pointer paths therefore have different recovery behavior; property edits do not have dependable individual history entries either.

**Design response:** one transaction per deliberate operation; coalesce typing/slider drags into a single entry; no history entry for selection alone. Every deletion, bulk assignment operation, and property commit must have consistent undo behavior. Preserve the current ability to undo and redo across floors.

### 4. Some operations need clearer scope and safeguards

Auto-seat clears current-floor table assignments, considers the global guest list, and does not reconcile existing standalone-chair or other-floor assignments. From code inspection, this can produce duplicate guest assignments in those mixed cases. Clear-all is current-floor-only despite a broad label. Removing a floor is immediate; double-click rename remains attached even when `lockFloors` is true. `finishDrawing` lacks a minimum-point guard although some entry points check for three vertices.

**Design response:** explicitly say “Auto-seat this floor” and “Clear seats on this floor”; show what will be replaced before applying; preserve already seated guests consistently; make replacement undoable; confirm floor removal with its content count; enforce structural locks at mutation boundaries. The concepts disable their Finish shape button until three points, but the shared engine still needs its own guard.

### 5. Save feedback can overstate success

Event and template wrappers set `saveState = 'saved'` after `update()` without branching on action success/failure. The venue editor does inspect success. A 900 ms autosave is useful, but needs visible saving/saved/failed/retry states and protection from overlapping requests and navigation with unsaved work.

**Design response:** consistent document status in every concept. Keep explicit Save; retain page-level assistant blockers and refresh behavior. Do not indicate success until the server confirms it. Prototype Save is deliberately labelled **Save locally** and does not simulate a server confirmation.

### 6. Editing precision is not equivalent to keyboard accessibility

Keyboard shortcuts exist, but canvas objects do not expose a keyboard selection/movement workflow. The snap picker is a custom listbox without full listbox keyboard behavior. The compiler also reports unassociated labels in existing controls. Touch has pointer events, but no explicit touch pan/pinch workflow. Some canvas zone colours and white labels need a contrast review.

**Design response:** labelled controls with state, an object list that can receive focus, numeric position/size controls, keyboard nudging, a named pan tool, and touch navigation. These are production requirements, not claims that the inherited canvas has already been made accessible.

## Three concepts

All three preserve Hallify's existing neutral surface, pink accent, and Inter typography. The objective is a calm working interface, not a new brand. Layout variance is restrained (3/10), motion minimal (1/10), and density moderate (6/10). Tabler icons use the package already installed. No new UI framework or dependencies were added.

### 01 Studio: grouped tool library

**Layout:** document header → history and permissions → persistent left tool library → canvas → right inspector. The library groups Navigate, Build the room, Arrange, and Refine. Each tool has a name and explanatory sentence. A prominent instruction strip updates with the active tool. Floor and seating totals stay visible below the editor.

**Typical task:** Place table → choose inventory in inspector → click a valid position → Select & move becomes active → edit chairs/rotation in the same inspector → Guests tab for seating.

**Why it helps:** the complete vocabulary stays visible; object properties have a stable location; users discover related tools without opening menus. This is the strongest default for a mixed venue-owner/event-planner audience.

**Tradeoff:** the tool library uses more horizontal space. On narrow screens it becomes a wrapped strip, with the inspector overlaid and dismissible.

### 02 Guided: task-based workspace

**Layout:** left navigation for Build/View the room, Arrange the space, Seat your guests, and Review the plan. A horizontal toolbar shows tools relevant to the current task. The canvas and inspector stay stable. “Browse every available tool” keeps secondary tools reachable.

**Typical task:** Arrange the space → place tables → Seat your guests opens guest management → Review shows cross-floor table/seat totals and unseated guests → save.

**Why it helps:** people think in outcomes before learning drawing tools. Room setup clearly changes to “View the room” when the structure is protected. Steps are freely navigable, not a mandatory wizard. Guest seating is absent in venue/template contexts.

**Tradeoff:** a practiced user may need extra task switches. The all-tools drawer prevents the workflow from blocking legitimate editing. Review is a summary and visual check, not an automated safety/capacity certification.

### 03 Canvas: compact dock and optional inspector

**Layout:** wide canvas with a floating, text-labelled dock for common tools. All tools opens an explanatory library, including wall, boundary, and removal tools where permitted. The inspector toggles from the top bar. Instructions and floor controls remain visible.

**Typical task:** use the dock to place an object → open inspector to configure it → close inspector for spatial work → reopen for seating and fine adjustments.

**Why it helps:** the drawing receives the most space; frequent actions are close together. This supports experienced planners and large rooms while avoiding an unexplained icon-only palette.

**Tradeoff:** less frequent tools are one level deeper. On small screens the dock scrolls horizontally and the inspector overlays the canvas.

## Functionality-preservation matrix

| Existing capability | Studio location | Guided location | Canvas location |
| --- | --- | --- | --- |
| Select, move, reshape | Navigate + inspector | Task toolbar + inspector | Dock + inspector |
| Boundary and walls | Build the room group | Build the room task | All tools library |
| Tables and chairs | Arrange group + inventory | Arrange task + inventory | Dock + inventory |
| Zones and colour/label editing | Arrange + inspector | Arrange + inspector | Dock + inspector |
| Freeform geometry and inventory limits | Same property controls | Same property controls | Same property controls |
| Chair counts, distribution, spacing, rotation | Inspector | Inspector | Toggleable inspector |
| Erase and object-specific delete | Refine + inspector | Arrange / all tools + inspector | All tools + inspector |
| Measure | Refine | Room/Arrange/Review toolbar | Dock |
| Zoom, pan, rulers, grid/object snap | Canvas controls | Canvas controls | Canvas controls |
| Shape finish/cancel | Instruction strip | Instruction strip | Instruction strip |
| Floors and floor management | Canvas header + footer rename | Canvas header + footer rename | Canvas header + footer rename |
| Undo/redo and shortcuts | Global history bar | Global history bar | Global history bar |
| Guests, groups, notes | Guests inspector tab | Seat your guests task | Guests inspector tab |
| Manual assignment/unassignment | Chair popover | Chair popover | Chair popover |
| Auto-seat and clear assignments | Guests inspector | Seat your guests | Guests inspector |
| Counts and assignments | Inspector + footer | Review + footer | Inspector + footer |
| Template picker / metadata / save | Document header | Document header | Document header |
| Mode restrictions and host integration | Existing caller rules | Same rules, task labels adapt | Same rules, library adapts |

## Recommendation

Start with **Studio**. It improves discoverability without requiring planners to adopt a new process. Add Guided's review summary and optional first-use guidance later. Keep Canvas as an optional compact layout for frequent users if testing shows demand; avoid maintaining three independent editors.

Before implementation, run the same tasks with venue owners and occasional event planners: create a rectangular wall footprint; place and configure an inventory table; assign a guest and correct a mistake; find a tool after changing tasks; recover from deletion. Compare unassisted completion, errors, time, and confidence. Do not assign the new concepts a numerical usability score until tested.

## Prototype boundaries and handoff

- The drawing, collision handling, guest management, properties, floors, and history are a frozen copy of the real `MapEditor.svelte` audited at the beginning, not a rewritten simulation. Its limitations remain observable. The copy prevents concurrent production refactoring from changing the comparison mid-review.
- The concepts are isolated in `design-concepts/floorplan-editor`. They use a small DOM adapter to invoke existing toolbar controls and observe active state. This is expedient for comparison, **not** the proposed production architecture. Production should expose typed editor commands/state and compose the chosen UI directly.
- Modes use the existing caller flags. “All capabilities” additionally exposes unrestricted/freeform table controls for inspection. It is a review-only mode, not a proposed permission escalation in the app.
- Switching concepts preserves the in-memory layout. Changing context or resetting replaces the sample. Save locally writes a browser snapshot; no backend calls are made and the snapshot is not automatically restored on refresh.
- The template picker demonstrates replacement with two sample layouts and retains guest records. Real template event-type filters, ranking, metadata editing, backend saves, assistant hooks, and navigation stay in the host integration and must be retained when implementing the selected concept. They are specified here, not represented as completed backend work.
- Footer rename is a sample-only convenience that remounts the editor on the first floor and resets its history. Production must call a proper undoable rename command instead. Existing native double-click rename and its lock limitation are inherited.
- Grid snap and Align objects are visually relabelled in the prototype stylesheet. Production must update translated text and accessible names, not rely on CSS-generated text.
- New shell controls have focus styles, semantic button names, tool pressed state, and a keyboard-trapped help dialog. This does not resolve the inherited canvas accessibility gaps.
- The initial sample zoom is fitted conservatively to the viewport. A production Fit room command should also recenter the canvas and support all floor bounds. It is not implemented by the existing engine.
- Touch gestures, full dark-theme QA, and authenticated persistence are outside the validation performed here.

## Validation

The standalone concept bundle builds successfully. Existing frozen `MapEditor.svelte` label and unused-selector warnings remain; no warnings originate from the new review component. Browser checks and final screenshots are recorded in `VALIDATION.md` and `screenshots/`.
