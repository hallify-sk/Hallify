import { error, fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  if (!locals.user) {
    redirect(303, `/login?redirect=${encodeURIComponent(`/halls/${params.slug}/book`)}`);
  }

  const orgId = locals.domainOrg!.id;

  const [hall] = await sql<HallRow[]>`
    SELECT * FROM halls
    WHERE slug = ${params.slug} AND is_public = true AND org_id = ${orgId}
  `;
  if (!hall) error(404, 'Hall not found');
  if (!hall.allow_reservations) error(403, 'This hall is not currently accepting bookings.');

  return { hall };
};

export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    if (!locals.user) return fail(401, { error: 'Not authenticated.' });

    const orgId = locals.domainOrg!.id;
    const data = await request.formData();

    const title       = String(data.get('title') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const event_date  = String(data.get('event_date') ?? '').trim();
    const start_time  = String(data.get('start_time') ?? '').trim() || null;
    const end_time    = String(data.get('end_time') ?? '').trim() || null;
    const num_guests  = parseInt(String(data.get('num_guests') ?? '0'), 10) || null;

    if (!title)      return fail(400, { error: 'Event name is required.' });
    if (!event_date) return fail(400, { error: 'Event date is required.' });

    // Confirm hall still belongs to this org
    const [hall] = await sql<{ id: string; max_people: number }[]>`
      SELECT id, max_people FROM halls
      WHERE slug = ${params.slug} AND is_public = true AND org_id = ${orgId}
        AND allow_reservations = true
    `;
    if (!hall) return fail(404, { error: 'Hall not found or not accepting bookings.' });

    if (num_guests && num_guests > hall.max_people) {
      return fail(400, { error: `This hall has a maximum capacity of ${hall.max_people} guests.` });
    }

    await sql`
      INSERT INTO reservations
        (hall_id, org_id, user_id, title, description, event_date, start_time, end_time, status)
      VALUES
        (${hall.id}, ${orgId}, ${locals.user.id}, ${title}, ${description || null},
         ${event_date}, ${start_time}, ${end_time}, 'pending')
    `;

    redirect(303, `/halls/${params.slug}?booked=1`);
  }
};
