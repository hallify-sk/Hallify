// Run with: npm run migrate
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import postgres from 'postgres';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const sql = postgres(url);

  const migrations = ['schema.sql', 'migration-002.sql', 'migration-003.sql', 'migration-004.sql', 'migration-005.sql', 'migration-006.sql'];

  for (const file of migrations) {
    const path = join(__dirname, file);
    console.log(`Running ${file}…`);
    const content = readFileSync(path, 'utf-8');
    await sql.unsafe(content);
    console.log(`  ✓ ${file} done`);
  }

  console.log('All migrations complete.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
