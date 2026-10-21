# Floorplan editor review

Three interactive UI/UX concepts and the current editor, using the same frozen production drawing engine and synthetic sample data. The engine is the audited starting version, isolated from concurrent changes to the app.

```sh
node design-concepts/floorplan-editor/preview.mjs
```

Open **http://127.0.0.1:4186/**. The concept tabs preserve your in-memory edits so you can compare the same task across layouts. Context switches reset the sample. Save locally writes a browser snapshot only; it does not save a real event or reload the snapshot automatically.

- [Full audit, score, tool inventory, concept rationale, and preservation matrix](./AUDIT.md)
- [Validation and limitations](./VALIDATION.md)
- [Studio screenshot](./screenshots/studio.png)
- [Guided screenshot](./screenshots/guided.png)
- [Canvas screenshot](./screenshots/canvas.png)

Use **Event seating** to test inventory and guest placement, **Venue setup** to test boundaries/walls/floors, **Template** for protected layouts without guests, and **All capabilities** for unrestricted/freeform table geometry.

Build a standalone review bundle:

```sh
node design-concepts/floorplan-editor/preview.mjs --build
```

Serve the generated `dist` directory with a static server. The concepts import the audited Svelte editor snapshot and use a prototype-only DOM toolbar adapter. No production routes or editor source were changed, and no dependencies were added.
