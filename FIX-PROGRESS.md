# Fix progress — accounts (sign-up, sign-in, profile, first run, new organisations)

| id | status | note |
|----|--------|------|
| B43 | done | Brand panel on the auth pages reads from i18n (sk + en). |
| B46 | done | Reset tokens stored as SHA-256 (legacy 32-char links still honoured for their hour); a completed reset spends every outstanding link and deletes all sessions; links are scoped apex vs. venue; double redemption refused. Apex + venue reset routes (venue files touched minimally). Changing the password in the profile signs out other sessions. |
