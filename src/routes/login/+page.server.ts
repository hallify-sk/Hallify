import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import sql from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { createSession } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // This route is only for custom-domain visitors
  if (!locals.domainOrg) redirect(303, '/app/login');
  // Already signed in — send them to halls
  if (locals.user) redirect(303, '/halls');
  return {
    domainOrg: locals.domainOrg,
    redirectTo: url.searchParams.get('redirect') ?? '/halls',
  };
};

export const actions: Actions = {
  login: async ({ request, cookies, locals }) => {
    if (!locals.domainOrg) return fail(400, { tab: 'login', error: 'Not a domain login page.' });

    const data = await request.formData();
    const email    = String(data.get('email') ?? '').toLowerCase().trim();
    const password = String(data.get('password') ?? '');
    const redirectTo = String(data.get('redirect') ?? '/halls');

    if (!email || !password) return fail(400, { tab: 'login', email, error: 'Email and password are required.' });

    const [user] = await sql<UserRow[]>`SELECT * FROM users WHERE email = ${email}`;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return fail(400, { tab: 'login', email, error: 'Invalid email or password.' });
    }

    await createSession(user.id, cookies);
    redirect(303, redirectTo);
  },

  register: async ({ request, cookies, locals }) => {
    if (!locals.domainOrg) return fail(400, { tab: 'register', error: 'Not a domain login page.' });

    const data = await request.formData();
    const first_name = String(data.get('first_name') ?? '').trim();
    const last_name  = String(data.get('last_name') ?? '').trim();
    const email      = String(data.get('email') ?? '').toLowerCase().trim();
    const password   = String(data.get('password') ?? '');
    const redirectTo = String(data.get('redirect') ?? '/halls');

    if (!first_name || !last_name) return fail(400, { tab: 'register', first_name, last_name, email, error: 'First and last name are required.' });
    if (!email) return fail(400, { tab: 'register', first_name, last_name, email, error: 'Email is required.' });
    if (password.length < 8) return fail(400, { tab: 'register', first_name, last_name, email, error: 'Password must be at least 8 characters.' });

    const [existing] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`;
    if (existing) return fail(400, { tab: 'register', first_name, last_name, email, error: 'An account with this email already exists.' });

    const password_hash = await bcrypt.hash(password, 12);
    const [newUser] = await sql<{ id: string }[]>`
      INSERT INTO users (email, password_hash, first_name, last_name, account_type)
      VALUES (${email}, ${password_hash}, ${first_name}, ${last_name}, 'client')
      RETURNING id
    `;

    await createSession(newUser.id, cookies);
    redirect(303, redirectTo);
  }
};
