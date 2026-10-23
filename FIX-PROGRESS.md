# Fix progress — accounts (sign-up, sign-in, profile, first run, new organisations)

| id | status | note |
|----|--------|------|
| B43 | done | Brand panel on the auth pages reads from i18n (sk + en). |
| B46 | done | Reset tokens stored as SHA-256 (legacy 32-char links still honoured for their hour); a completed reset spends every outstanding link and deletes all sessions; links are scoped apex vs. venue; double redemption refused. Apex + venue reset routes (venue files touched minimally). Changing the password in the profile signs out other sessions. |
| B130 | done | Forgot-password link moved after the password input in the DOM (grid keeps it beside the label), so Tab goes email -> password. |
| B172 | done | A legacy apex client account (client, no org) is turned into a personal Hallify account at sign-in instead of getting a session that is then ignored. |
| I27 | done | Sign-in counts only failed attempts (new rateLimitStatus peek); registration is counted after the form validates. |
