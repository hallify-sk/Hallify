# Validation

21 October 2026. The concepts use the audited editor snapshot from commit `6a6934f5a0c4a1ac45412b776c7e13670d958536`. Concurrent changes to the production editor are outside this validation.

## Browser checks

Automated interaction checks passed in installed Google Chrome via Playwright:

- Select an existing table and edit its name in the real property inspector.
- Drag a table and verify the serialized position changes. **Known baseline defect reproduced:** this SVG path does not create an undo checkpoint.
- Place a standalone chair through the new tool library; undo and redo its placement.
- Assign a guest through the existing chair popover and verify the serialized assignment.
- Open guest management and the review summary through Guided tasks.
- Reach the eraser through Canvas's secondary tool library.
- Switch all three concepts without losing an edited table name.
- Switch to venue context, verify furniture placement tools are absent, draw a four-corner wall, and verify it is serialized.
- Verify the concept's Finish shape action is disabled before three corners.
- Switch to unrestricted mode and access freeform round-table shape and radius controls.
- Switch to template context and verify guest management is absent.
- At 1280 × 800, all three concept status bars stay within the viewport.
- At 390 px width, all three concept pages have no horizontal document overflow and the Inspector button dismisses the overlay.
- Open the audit dialog and dismiss it with Escape.
- No browser runtime errors during the successful verification run.

Desktop screenshots were captured at 1512 × 982 for Studio, Guided, Canvas, and the baseline. Mobile full-page captures were made at 390 × 844 for each concept. Studio, Guided, Canvas, and a compact-width capture were visually inspected; the inspector uses a single scrolling region and the original baseline remains available for comparison.

## Build

```sh
node design-concepts/floorplan-editor/preview.mjs --build
```

The standalone production build succeeds. The inherited snapshot emits five unassociated-label warnings and three unused-CSS-selector warnings. The new review component emits none. The preview uses existing installed dependencies; package files were not changed by this task.

## Limits

This verifies the review prototype, not production readiness. No authenticated backend saves, real booking data, real inventory, assistant integration, dark-theme behavior, touch pan/pinch gestures, or full accessibility audit were tested. Existing engine defects are documented in AUDIT.md and intentionally remain visible. The preview stores a snapshot locally only when Save locally is pressed; refresh does not restore it automatically.

The current-baseline screenshot inherits the component's original full-viewport height and demonstrates clipping inside a parent shell. It is an isolated component rendering, not a capture of the authenticated application page.
