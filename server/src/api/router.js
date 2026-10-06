import { Router } from 'express';
import { createAuthorsRouter } from '../authors/authors.js';
import { createMetricsRouter } from '../metrics/metrics.js';
import { createHealthRouter } from './health.js';
import { createReposRouter } from './repos.js';

/**
 * Mounts all API sub-routers. The repos router needs services (queue +
 * storage dir) and is only mounted when they are provided — tests mounting a
 * bare app keep working.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {{ reposDir?: string, queue?: object }} [services]
 */
export function createApiRouter(db, services = {}) {
  const router = Router();
  router.use('/health', createHealthRouter(db));
  router.use('/repos', createAuthorsRouter({ db }));
  router.use('/repos', createMetricsRouter({ db }));
  if (services.reposDir && services.queue) {
    router.use('/repos', createReposRouter({ db, ...services }));
  }
  return router;
}
