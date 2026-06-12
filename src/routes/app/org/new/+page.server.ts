import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import sql from '$lib/db';

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  return {};
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    if (!locals.user) redirect(303, '/app/login');

    const data = await request.formData();
    const name = (data.get('name') as string)?.trim();

    if (!name || name.length < 2) {
      return fail(400, { error: 'Organization name must be at least 2 characters.' });
    }

    // Derive a unique slug
    let baseSlug = toSlug(name) || 'org';
    let slug = baseSlug;
    let attempt = 1;
    while (true) {
      const [exists] = await sql<{ id: string }[]>`
        SELECT id FROM organizations WHERE slug = ${slug}
      `;
      if (!exists) break;
      slug = `${baseSlug}-${++attempt}`;
    }

    const [org] = await sql<{ id: string }[]>`
      INSERT INTO organizations (name, slug) VALUES (${name}, ${slug}) RETURNING id
    `;

    // Owner membership
    await sql`
      INSERT INTO organization_members (org_id, user_id, role)
      VALUES (${org.id}, ${locals.user.id}, 'owner')
    `;

    // Free subscription
    await sql`
      INSERT INTO subscriptions (org_id, plan, status)
      VALUES (${org.id}, 'free', 'active')
    `;

    // Switch session to new org
    const sessionId = cookies.get('session_id');
    if (sessionId) {
      await sql`UPDATE sessions SET current_org_id = ${org.id} WHERE id = ${sessionId}`;
    }

    redirect(303, '/app/');
  },
};
