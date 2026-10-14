import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { applyDiscoveryMigrations } from './discovery-migrations';

const databases: DatabaseSync[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function database() {
  const sqlite = new DatabaseSync(':memory:'); databases.push(sqlite);
  sqlite.exec(readFileSync(new URL('../../../migrations/0001_baseline.sql', import.meta.url), 'utf8'));
  sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('org','Existing venue','existing')");
  sqlite.exec("INSERT INTO halls(id,org_id,name,max_people,is_public) VALUES ('hall','org','Existing hall',100,1)");
  return sqlite;
}

function binding(sqlite: DatabaseSync, beforeBatch?: () => Promise<void>): App.Locals['db'] {
  function prepare(sql: string, values: string[] = []) {
    return { sql, values, bind: (...args: string[]) => prepare(sql, args), all: async () => ({ results: sqlite.prepare(sql).all(...values) }) };
  }
  return {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      if (beforeBatch) { const callback = beforeBatch; beforeBatch = undefined; await callback(); }
      sqlite.exec('BEGIN');
      try { for (const statement of statements) sqlite.prepare(statement.sql).run(...statement.values); sqlite.exec('COMMIT'); return []; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as App.Locals['db'];
}

describe('additive discovery release migrations', () => {
  it('preserves existing venue data, defaults to nonpartner and records both migrations exactly once', async () => {
    const sqlite = database(), db = binding(sqlite);
    await applyDiscoveryMigrations(db);
    await applyDiscoveryMigrations(db);
    expect(sqlite.prepare('SELECT name,latitude,longitude FROM halls').get()).toMatchObject({ name: 'Existing hall', latitude: null, longitude: null });
    expect(sqlite.prepare('SELECT is_hallify_partner FROM organizations').get()).toMatchObject({ is_hallify_partner: 0 });
    expect(sqlite.prepare('SELECT name FROM d1_migrations ORDER BY name').all().map(row => row.name)).toEqual(['0004_hall_coordinates.sql','0005_hallify_partners.sql']);
    expect(() => sqlite.exec('UPDATE halls SET latitude = 91')).toThrow();
    expect(() => sqlite.exec('UPDATE organizations SET is_hallify_partner = 2')).toThrow();
  });

  it('recovers when another request completes the same migration before its batch starts', async () => {
    const sqlite = database();
    const racing = binding(sqlite, () => applyDiscoveryMigrations(binding(sqlite)));
    await applyDiscoveryMigrations(racing);
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM d1_migrations').get()).toMatchObject({ count: 2 });
    expect(sqlite.prepare('SELECT name FROM halls').get()).toMatchObject({ name: 'Existing hall' });
  });

  it('does not create a new database schema when the existing app tables are missing', async () => {
    const sqlite = new DatabaseSync(':memory:'); databases.push(sqlite);
    await expect(applyDiscoveryMigrations(binding(sqlite))).rejects.toThrow('Existing Hallify schema required');
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([]);
  });
});
