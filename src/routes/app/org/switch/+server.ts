import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sql from '$lib/db';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) redirect(303, '/app/login');

  const data = await request.formData();
  const orgId = data.get('org_id') as string;
  const returnTo = (data.get('return_to') as string) || '/';

  if (!orgId) error(400, 'Missing org_id');

  // Verify user is actually a member of the requested org
  const [membership] = await sql<{ org_id: string }[]>`
    SELECT org_id FROM organization_members
    WHERE org_id = ${orgId} AND user_id = ${locals.user.id}
  `;
  if (!membership) error(403, 'Not a member of that organization');

  const sessionId = cookies.get('session_id');
  if (sessionId) {
    await sql`UPDATE sessions SET current_org_id = ${orgId} WHERE id = ${sessionId}`;
  }

  redirect(303, returnTo);
};
