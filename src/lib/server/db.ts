import { drizzle } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from '$env/static/private';

// Try both SvelteKit env and process.env as fallbacks
const dbUrl = DATABASE_URL || process.env.DATABASE_URL;

console.log('Environment variables check:');
console.log('SvelteKit DATABASE_URL exists:', !!DATABASE_URL);
console.log('Process.env DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('Final dbUrl exists:', !!dbUrl);
console.log('Final dbUrl type:', typeof dbUrl);

if (dbUrl) {
	console.log('DATABASE_URL value:', dbUrl.replace(/:[^:@]*@/, ':****@'));
} else {
	console.error('❌ DATABASE_URL not found in either source');
	console.error('Available SvelteKit env vars:', Object.keys(process.env).filter(key => key.includes('DATABASE')));
}

if (!dbUrl) {
	console.error('❌ DATABASE_URL environment variable is not set');
	throw new Error('DATABASE_URL environment variable is not set');
}

if (typeof dbUrl !== 'string') {
	console.error('❌ DATABASE_URL is not a string:', typeof dbUrl);
	throw new Error('DATABASE_URL must be a string');
}

console.log('✅ Attempting to connect to database...');

export const db = drizzle(dbUrl);
