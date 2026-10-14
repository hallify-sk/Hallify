import { dbAll } from '$lib/db/index';

/** Only the two additive discovery migrations. No data updates or general migration runner. */
export async function applyDiscoveryMigrations(db: App.Locals['db']): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [halls, organizations] = await Promise.all([
      dbAll<{ name: string }>(db, 'PRAGMA table_info(halls)'),
      dbAll<{ name: string }>(db, 'PRAGMA table_info(organizations)'),
    ]);
    const hallColumns = new Set(halls.map(column => column.name));
    const orgColumns = new Set(organizations.map(column => column.name));
    if (!hallColumns.has('id') || !orgColumns.has('id')) throw new Error('Existing Hallify schema required.');
    const sql: string[] = [];
    if (!hallColumns.has('latitude')) sql.push('ALTER TABLE halls ADD COLUMN latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90)');
    if (!hallColumns.has('longitude')) sql.push('ALTER TABLE halls ADD COLUMN longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)');
    if (!orgColumns.has('is_hallify_partner')) sql.push('ALTER TABLE organizations ADD COLUMN is_hallify_partner INTEGER NOT NULL DEFAULT 0 CHECK (is_hallify_partner IN (0, 1))');
    sql.push(
      'CREATE INDEX IF NOT EXISTS idx_halls_public_location ON halls(is_public, plan_locked, latitude, longitude)',
      'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)',
      "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0004_hall_coordinates.sql')",
      "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0005_hallify_partners.sql')",
    );
    try {
      // D1 batch is transactional: record migrations only with the completed schema.
      await db.batch(sql.map(statement => db.prepare(statement)));
      return;
    } catch (error) {
      const message = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}` : String(error);
      // Another request may have completed the same additive migration first.
      if (attempt === 2 || !/duplicate column name/i.test(message)) throw error;
    }
  }
}
