# Fix progress: permissions team (fix/permissions)

| id | status | note |
|----|--------|------|
| B5 | done | Legacy /app/manage/users and /users/[id] removed; GET on the old paths redirects to /app/manage/members, old POST actions get 405. Nothing linked to it. |
| B32 | done | Inviting or switching someone to the Admin level now requires the actor to be able to grant every Administrator permission (`canGrantAdminAccess`); the Admin option is disabled in the UI otherwise. |
| B33 | done | Members `changeRole`/`remove`, Invites `invite`/`revoke` and every Roles action no longer call `requireOrgStaff`; they check members.manage / invites.manage / roles.manage plus rank. |
| B34 | done | The legacy-admin fallback lives in one place (`withLegacyAdmin`), applied by `loadMemberAccess`, `buildAccess`, `actorContext` and `targetMemberAccess`. Becoming an admin (invite, access-level select) attaches the Administrator role row so admins get its rank; migration 0017 attaches it to existing flag-only admins. |
| B86 | done | Invites count pending (unexpired, unaccepted) invites against the seat cap (`seatsSpokenFor` in $lib/server/invites), excluding the address being re-invited; also fixed the text comparison that kept expired invites alive until midnight. limits.ts untouched. |
| B114 | done (invite part) | A failed invite e-mail is reported in an error banner with the invite link and a Copy button, instead of a green success. Assign-client toast and announcements are other teams' scope. |
| M12 | done | Invites list: Copy link on each pending invite, Resend (new token, fresh 7 days, re-checks rank/roles/seats) on pending and expired ones; expired invites stay listed for 30 days marked "Platnosť vypršala". |
| B157 | done | Invalid e-mails refused (`enterValidEmail`); revoking an invite that no longer exists returns 404 "Táto pozvánka už neexistuje" (meta.changes); members ordered owner, admins, members. |
