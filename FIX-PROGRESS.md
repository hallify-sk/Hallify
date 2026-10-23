# AI assistant fixes (team ai, branch fix/ai)

| id | status | note |
|----|--------|------|
| B122 | done | renderReply renders headings, numbered lists, rules and pipe tables (escaped first); styles in page and widget |
| B123 | done | full page follows open_page (navigates, conversation continues in the open widget) |
| B139 | done | one formatter `creditAmount` (src/lib/assistant/credits.ts) for header, widget and settings/ai |
| B28 | done | recordSavedDraft() measures the saved JSON (seated guests, edited or not); a save carrying none of the proposal withdraws it as "not saved" instead of "applied". Callers in the two editor routes switched (one line each). The editor reload itself is the editors team's part |
| B149 | not done | |
| I1 | not done | |
| I5 | not done | |
| I26 | not done | |
