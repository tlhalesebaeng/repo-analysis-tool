import { Router } from 'express';
import { createHealthRouter } from './health.js';
import { createReposRouter } from './repos.js';

/**
 * Mounts all API sub-routers. The repos router needs services (queue +
 * storage dir) and is only mounted when they are provided — tests mounting a
 * bare app keep working. Authors/metrics routers land in M2/M3.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ reposDir?: string, queue?: object }} [services]
 */
export function createApiRouter(db, services = {}) {
  const router = Router();
  router.use('/health', createHealthRouter(db));
  if (services.reposDir && services.queue) {
    router.use('/repos', createReposRouter({ db, ...services }));
  }
  return router;
}
