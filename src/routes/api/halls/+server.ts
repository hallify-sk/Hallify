import { lucia } from '$lib/server/auth';
import { isValidEmail } from '$lib/util';
import { access } from '$lib/server/sql.js';

import { generateIdFromEntropySize } from 'lucia';
import { hash } from '@node-rs/argon2';
import mysql from 'mysql2/promise';

export async function GET(event) {
	if (!event.locals.user) {
		return new Response(null, {
			status: 401
		});
	}
	// ...
}

export async function POST({ request, locals }) {
	if (!locals.user)
		return new Response(null, {
			status: 401
		});
	console.log((await locals.user).permissions);
	const db = await mysql.createConnection(access);
	const formData = await request.formData();
	const email = formData.get('email');
	if (!email || typeof email !== 'string' || !isValidEmail(email)) {
		await db.end();
		return new Response('Invalid email', {
			status: 400
		});
	}
	const [rows] = await db.query({
		sql: 'SELECT * FROM user WHERE email = ?',
		values: [email],
		rowsAsArray: true
	});
	if ((rows as Array<unknown>).length) {
		await db.end();
		return new Response('Email already used', {
			status: 400
		});
	}
	const password = formData.get('password');
	if (!password || typeof password !== 'string' || password.length < 6) {
		await db.end();
		return new Response('Invalid password', {
			status: 400
		});
	}

	const passwordHash = await hash(password, {
		// recommended minimum parameters
		memoryCost: 19456,
		timeCost: 2,
		outputLen: 32,
		parallelism: 1
	});
	const userId = generateIdFromEntropySize(10); // 16 characters long

	try {
		await db.execute('INSERT INTO user (id, email, password_hash) VALUES (?, ?, ?)', [
			userId,
			email,
			passwordHash
		]);
		await db.end();
		const session = await lucia.createSession(userId, {});
		const sessionCookie = lucia.createSessionCookie(session.id);
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/',
				'Set-Cookie': sessionCookie.serialize()
			}
		});
	} catch {
		// db error, email taken, etc
		await db.end();
		return new Response('Server error', {
			status: 500
		});
	}
}
