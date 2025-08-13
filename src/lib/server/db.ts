import { drizzle } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from '$env/static/private';

if (!DATABASE_URL) {
	throw new Error('DATABASE_URL environment variable is not set');
}

console.log('Connecting to database with URL:', DATABASE_URL.replace(/:[^:@]*@/, ':****@')); // Log URL with password masked

export const db = drizzle(DATABASE_URL);
