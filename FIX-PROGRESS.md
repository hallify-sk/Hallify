# Fix progress: shell (console shell, sidebar, phone layout, themes and focus)

Branch: fix/shell

| id | status | note |
|----|--------|------|
| B131 | done | readableInkOn picks whichever of near-black and white contrasts more; #f05ca1 now gets dark text (6:1). |
| B133 | done | app.css drops the outline only for the text-like fields that get the box-shadow ring; checkboxes and radios get an offset focus outline again. |
| B167 | done | The stored/OS theme is applied only on console paths (/app/*, not the site-builder preview) in app.html and the root layout; leaving the console removes data-theme, so the venue site stays light. |
| B156 | done | Org switcher (and the sidebar user menu) close after every navigation (afterNavigate) and on Escape. Only the switcher part was in scope. |
| I28 | done | Org switcher shows each org's slug next to the role, and the slug in the button tooltip, so same-named orgs can be told apart. |
| B36 | done | Root layout loads the member's effective permissions (same resolution as requireOrgPermission, in $lib/server/nav-access); $lib/console-nav maps each sidebar link to the guard of its page, so custom roles see their pages and plain members see none. |
| B78 | done | Sidebar "Verejná stránka" goes to the venue's /halls on its own host and, from the apex, to its own domain (orgPublicBaseUrl + /halls, new tab); "Hľadať priestor" stays for the apex venue search. |
| B105 | done | Owners/admins get a "Tímový chat" link to /app/messages next to the client inbox (only the sidebar link is ours). |
| B108 | done | The root layout sends the presence heartbeat every 30 s (and on returning to the tab) from every console page for signed-in staff, not only from Messages. The Messages page still sends its own beat (reservations team file; harmless duplicate, can be removed there). The dashboard count refresh is not in this scope. |
| B7 | done | Below 900 px the console shows a top bar (menu button with unread ping, logo, org name); the sidebar leaves the row and opens as an off-canvas drawer (role=dialog with the shared dialog action: Escape, focus trap, focus return; closes on backdrop, navigation and widening). Content gets the full width; the editor rail mode is unchanged on desktop and never applies inside the drawer. Individual pages that are too wide at 390 px (e.g. the team chat panes) belong to their owners. |
