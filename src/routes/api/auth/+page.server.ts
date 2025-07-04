import { users } from '$lib/server/schema.js';
import { isValidEmail } from '$lib/util';
import {
    createSession,
    generateSessionToken,
    validatePassword,
    setSessionTokenCookie
} from '$lib/server/auth.js';
import { TokenBucket } from '$lib/server/ratelimit';
import { db } from '$lib/server/db.js';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

const loginBucket = new TokenBucket<string>(5, 1);

export const actions = {
    default: async ({ request, cookies, locals, getClientAddress }) => {
        if (!loginBucket.consume(getClientAddress(), 1)) {
            return fail(429, {
                message: 'Príliš veľa pokusov o prihlásenie.'
            });
        }
        
        if (locals.session) {
            return fail(400, {
                message: 'Už ste prihlásený.'
            });
        }
        
        const formData = await request.formData();
        const errors: Record<string, string> = {};
        
        // Validate email
        let email = formData.get('email')?.toString();
        if (!email || typeof email !== 'string' || !isValidEmail(email)) {
            errors.email = 'E-Mail je neplatný.';
        } else {
            email = email.toLowerCase();
        }
        
        // Validate password
        const password = formData.get('password')?.toString();
        if (!password || typeof password !== 'string') {
            errors.password = 'Heslo je povinné.';
        }
        
        // If there are validation errors, return them
        if (Object.keys(errors).length > 0) {
            return fail(400, {
                message: 'Prosím vyplňte všetky povinné polia.',
                errors
            });
        }
        
        try {
            const user = (await db.select().from(users).where(eq(users.email, email!)).limit(1))[0];
            
            if (!user || !(await validatePassword(password!, user.password_hash))) {
                return fail(401, {
                    message: 'Nesprávny e-mail alebo heslo.',
                    errors: {
                        password: 'Nesprávny e-mail alebo heslo.'
                    }
                });
            }

            const token = generateSessionToken();
            const session = await createSession(token, user.id);
            setSessionTokenCookie(cookies, token, session.expires_at);

            return { success: true };
        } catch (error) {
            console.error('Login error:', error);
            return fail(500, {
                message: 'Nastala chyba pri prihlasovaní. Skúste to znovu.'
            });
        }
    }
};
