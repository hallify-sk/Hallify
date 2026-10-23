# Fix progress: permissions team (fix/permissions)

| id | status | note |
|----|--------|------|
| B5 | done | Legacy /app/manage/users and /users/[id] removed; GET on the old paths redirects to /app/manage/members, old POST actions get 405. Nothing linked to it. |
| B32 | done | Inviting or switching someone to the Admin level now requires the actor to be able to grant every Administrator permission (`canGrantAdminAccess`); the Admin option is disabled in the UI otherwise. |
| B33 | done | Members `changeRole`/`remove`, Invites `invite`/`revoke` and every Roles action no longer call `requireOrgStaff`; they check members.manage / invites.manage / roles.manage plus rank. |
| B34 | done | The legacy-admin fallback lives in one place (`withLegacyAdmin`), applied by `loadMemberAccess`, `buildAccess`, `actorContext` and `targetMemberAccess`. Becoming an admin (invite, access-level select) attaches the Administrator role row so admins get its rank; migration 0017 attaches it to existing flag-only admins. |
