import { Router } from 'express';
import { createHealthRouter } from './health.js';

/** Mounts all API sub-routers. Routers for repos/authors/metrics land in M1-M3. */
export function createApiRouter(db) {
  const router = Router();
  router.use('/health', createHealthRouter(db));
  return router;
}
