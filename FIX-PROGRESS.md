# Fix progress: editors (floor-plan editor, templates, event layouts, seating)

Branch: `fix/editors`

| Id | Status | Note |
|----|--------|------|
| B65 | done | `countSeats` counts round tables by `chairs` and adds standalone chairs, matching the editor. |
| B109 | done | `csvCell` defuses `= + - @ \t \r` values with a leading apostrophe before quoting. |
| B66 | done | Guest CSV import decodes strict UTF-8, else Windows-1250 (and UTF-16 with BOM), so names and the Poznámka column survive. |
| I24 | done | Re-import skips guests already on the list (name + group) and says who; export headers localised, `;` for Slovak. |
