-- Admins hold the Administrator role row, not only the legacy flag.
--
-- `organization_members.role = 'admin'` grants every Administrator permission, but
-- rank comes from role rows. Migration 0007 attached the Administrator role to the
-- admins that existed then; admins made since (an invite sent as Admin with no role
-- ticked, or the access-level select on the Members tab) got the flag alone. They
-- were let into the People area and then could act on nobody, because a flag ranks
-- below every real role. The app now attaches the row whenever somebody becomes an
-- admin; this catches up the admins made before it did.
--
-- Additive and idempotent: only inserts missing assignment rows. Skipped where the
-- org's Administrator role was given billing.manage, which the flag never implied.
INSERT INTO org_member_roles (id, org_id, user_id, role_id)
SELECT lower(hex(randomblob(16))), m.org_id, m.user_id, r.id
FROM organization_members m
JOIN org_roles r
  ON r.org_id = m.org_id
 AND r.is_default = 0
 AND r.name = 'Administrator'
 AND r.position = (
   SELECT MAX(r2.position) FROM org_roles r2
    WHERE r2.org_id = m.org_id AND r2.is_default = 0 AND r2.name = 'Administrator'
 )
WHERE m.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM json_each(r.permissions) j WHERE j.value = 'billing.manage')
  AND NOT EXISTS (
    SELECT 1 FROM org_member_roles x
     WHERE x.org_id = m.org_id AND x.user_id = m.user_id AND x.role_id = r.id
  );
