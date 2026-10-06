import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Applies pending *.sql migrations in filename order, each inside a
 * transaction, recording them in the _migrations table.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]} Names of the migrations applied by this call (empty when up to date).
 */
export function migrate(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);

  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applyOne = db.transaction((file) => {
    db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
  });

  const newlyApplied = [];
  for (const file of files) {
    if (!applied.has(file)) {
      applyOne(file);
      newlyApplied.push(file);
    }
  }
  return newlyApplied;
}
