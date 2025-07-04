import { users } from '$lib/server/schema.js';
import { isValidEmail } from '$lib/util';
import commonList from '$lib/data/commonPasswords.json';
import {
    createSession,
    generateSessionToken,
    hashPassword,
    setSessionTokenCookie
} from '$lib/server/auth.js';
import { TokenBucket } from '$lib/server/ratelimit';
import { db } from '$lib/server/db.js';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

const createUserBucket = new TokenBucket<string>(8, 1);

export const actions = {
    default: async ({ request, cookies, locals, getClientAddress }) => {
        if (!createUserBucket.consume(getClientAddress(), 1)) {
            return fail(429, {
                message: 'Príliš veľa požiadaviek.'
            });
        }
        
        if (locals.session) {
            return fail(400, {
                message: 'Nie je možné vytvoriť účet, ak ste prihlásený.'
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
            // Check if email already exists
            if ((await db.select().from(users).where(eq(users.email, email)).limit(1)).length > 0) {
                errors.email = 'E-Mail je už použitý.';
            }
        }
        
        // Validate password
        const password = formData.get('password')?.toString();
        if (!password || typeof password !== 'string') {
            errors.password = 'Heslo je povinné.';
        } else {
            if (!/^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{8,}$/.test(password)) {
                errors.password = 'Heslo musí obsahovať aspoň 8 znakov, jedno veľké písmeno, jedno malé písmeno a jednu číslicu.';
            } else if (commonList.some((i) => i.toLowerCase() == password.toLowerCase())) {
                errors.password = 'Vaše heslo bolo nájdené v zoznáme slabých hesiel.';
            }
        }
        
        // Validate first name
        const name = formData.get('firstName');
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            errors.firstName = 'Meno je povinné.';
        }
        
        // Validate last name
        const surname = formData.get('lastName');
        if (!surname || typeof surname !== 'string' || surname.trim().length === 0) {
            errors.lastName = 'Priezvisko je povinné.';
        }
        
        // If there are validation errors, return them
        if (Object.keys(errors).length > 0) {
            return fail(400, {
                message: 'Prosím opravte chyby vo formulári.',
                errors
            });
        }
        
        try {
            const passwordHash = await hashPassword(password ?? "");
            const user = (
                await db
                    .insert(users)
                    .values({
                        email: email,
                        password_hash: passwordHash,
                        permission_id: 1,
                        first_name: name!,
                        last_name: surname!
                    })
                    .returning()
            )[0];

            const token = generateSessionToken();
            const session = await createSession(token, user.id);
            setSessionTokenCookie(cookies, token, session.expires_at);

            return { success: true };
        } catch (error) {
            console.error('Registration error:', error);
            return fail(500, {
                message: 'Nastala chyba pri vytváraní účtu. Skúste to znovu.'
            });
        }
    }
};
