# Fix progress: shell (console shell, sidebar, phone layout, themes and focus)

Branch: fix/shell

| id | status | note |
|----|--------|------|
| B131 | done | readableInkOn picks whichever of near-black and white contrasts more; #f05ca1 now gets dark text (6:1). |
| B133 | done | app.css drops the outline only for the text-like fields that get the box-shadow ring; checkboxes and radios get an offset focus outline again. |
| B167 | done | The stored/OS theme is applied only on console paths (/app/*, not the site-builder preview) in app.html and the root layout; leaving the console removes data-theme, so the venue site stays light. |
| B156 | done | Org switcher (and the sidebar user menu) close after every navigation (afterNavigate) and on Escape. Only the switcher part was in scope. |
| I28 | done | Org switcher shows each org's slug next to the role, and the slug in the button tooltip, so same-named orgs can be told apart. |
