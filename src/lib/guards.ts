/** Authorization guards for form actions and endpoints.
 *
 *  ⚠️  WHY THIS EXISTS — read before touching any action.
 *
 *  SvelteKit does NOT run `load` (page or layout) before a form action. A POST goes
 *  straight to the action; `load` only runs afterwards, to re-render. So a guard placed
 *  in `+layout.server.ts`'s `load` protects GET navigation and nothing else — every
 *  action underneath it is reachable by POSTing directly to `?/actionName`.
 *
 *  That is exactly what happened here: the platform-admin check lived only in
 *  `/app/platform/+layout.server.ts`'s load, so an ANONYMOUS request could
 *  `POST /app/platform/users?/grantPlatformAdmin` and make any account a platform
 *  admin. The same shape left every `/app/manage/*` action open to any org member.
 *
 *  RULE: every mutating action re-checks authorization itself, via these helpers.
 *  Never rely on a load guard for anything but redirecting a browser.
 *
 *  Separately: scoping is not authorization. An action must ALSO constrain its SQL to
 *  the caller's org (`WHERE ... AND org_id = ?`) — otherwise an authorized user of org A
 *  can still act on org B's rows by id.
 */
import { error } from '@sveltejs/kit';
import type { OrgContext } from '../app.d';

type Locals = App.Locals;

/** Any signed-in user. Returns the user so callers can use it directly. */
export function requireUser(locals: Locals) {
  if (!locals.user) error(401, 'Not signed in');
  return locals.user;
}

/** A platform administrator. Use on every `/app/platform/**` action. */
export function requirePlatformAdmin(locals: Locals) {
  const user = requireUser(locals);
  if (!user.is_platform_admin) error(403, 'Forbidden');
  return user;
}

/** Any member of the active organization. Returns the org context. */
export function requireOrg(locals: Locals): OrgContext {
  requireUser(locals);
  if (!locals.currentOrg) error(403, 'No active organization');
  return locals.currentOrg;
}

/** Owner or admin of the active organization — i.e. "staff".
 *  Use on every `/app/manage/**` action and anywhere a member must not reach. */
export function requireOrgStaff(locals: Locals): OrgContext {
  const org = requireOrg(locals);
  if (org.role !== 'owner' && org.role !== 'admin') error(403, 'Forbidden');
  return org;
}

/** Owner of the active organization (billing, destructive org-level operations). */
export function requireOrgOwner(locals: Locals): OrgContext {
  const org = requireOrg(locals);
  if (org.role !== 'owner') error(403, 'Forbidden');
  return org;
}

/** True when the caller is staff of the active org. For branching, not for guarding. */
export function isOrgStaff(locals: Locals): boolean {
  const r = locals.currentOrg?.role;
  return r === 'owner' || r === 'admin';
}
