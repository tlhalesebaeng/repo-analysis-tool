import { Router } from 'express';

/**
 * GET /api/health - liveness probe. Verifies the SQLite connection and lists
 * applied migrations so the dashboard can confirm it talks to a live backend.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function createHealthRouter(db) {
  const router = Router();

  router.get('/', (req, res) => {
    const alive = db.prepare('SELECT 1').get() !== undefined;
    const migrations = db.prepare('SELECT name FROM _migrations ORDER BY name').all().map((m) => m.name);
    res.json({ ok: alive, service: 'rat-server', db: alive ? 'ok' : 'unavailable', migrations });
  });

  return router;
}
