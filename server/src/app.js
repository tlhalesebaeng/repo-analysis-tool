import express from 'express';
import { API_BASE } from '@rat/shared/constants';
import { createApiRouter } from './api/router.js';

/**
 * Builds the Express application. Kept separate from the listener so tests
 * can mount the app directly with their own database instance.
 *
 * @param {import('better-sqlite3').Database} db
 */
export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(API_BASE, createApiRouter(db));

  // Unknown API routes and mounted-but-unmatched paths return JSON, not HTML.
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // eslint-disable-next-line no-unused-vars -- Express requires the 4-arg signature to flag error handlers.
  app.use((err, req, res, next) => {
    console.error('[rat] unhandled error:', err);
    res.status(err.status ?? 500).json({ error: err.message ?? 'Internal error' });
  });

  return app;
}
