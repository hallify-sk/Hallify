import { User } from '$lib/server/models.js';
import { isValidEmail } from '$lib/util';
import commonList from '$lib/data/commonPasswords.json';
import {
	createSession,
	generateSessionToken,
	hashPassword,
	setSessionTokenCookie
} from '$lib/server/auth.js';
import { TokenBucket } from '$lib/server/ratelimit';

const createUserBucket = new TokenBucket<string>(8, 1);

export async function POST({ request, cookies, locals, getClientAddress }) {
	if (!createUserBucket.consume(getClientAddress(), 1)) {
		return new Response('Príliš veľa požiadaviek.', {
			status: 429
		});
	}
	if (locals.session) {
		return new Response('Nie je možné vytvoriť účet, ak ste prihlásený.', {
			status: 400
		});
	}
	const formData = await request.formData();
	let email = formData.get('email');
	if (!email || typeof email !== 'string' || !isValidEmail(email)) {
		return new Response('E-Mail je neplatný.', {
			status: 400
		});
	}
	email = email.toLowerCase();
	if (await User.findOne({ where: { email } })) {
		return new Response('E-Mail je už použitý.', {
			status: 409
		});
	}
	const password = formData.get('password');
	if (!password || typeof password !== 'string') {
		return new Response('Neplatné heslo.', {
			status: 400
		});
	}
	const name = formData.get('firstName');
	if (!name || typeof name !== 'string') {
		return new Response('Neplatné meno.', {
			status: 400
		});
	}
	const surname = formData.get('lastName');
	if (!surname || typeof surname !== 'string') {
		return new Response('Neplatné priezvisko.', {
			status: 400
		});
	}
	if (!/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{8,}$/.test(password)) {
		return new Response('Heslo nespĺňa zadané kritéria.', {
			status: 400
		});
	}
	if (commonList.some((i) => i.toLowerCase() == password.toLowerCase())) {
		return new Response(`Vaše heslo bolo nájdené v zoznáme slabých hesiel.`, {
			status: 400
		});
	}

	const passwordHash = await hashPassword(password);
	const user = await User.create({
		email,
		password_hash: passwordHash,
		permission_id: 1,
		first_name: name,
		last_name: surname
	});

	const token = generateSessionToken();
	const session = await createSession(token, user.id);
	setSessionTokenCookie(cookies, token, session.expires_at);

	return new Response(null, { status: 200 });
}
