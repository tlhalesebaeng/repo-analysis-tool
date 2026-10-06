import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createApp } from '../src/app.js';

let db;
let app;
let dbPath;

beforeAll(() => {
  dbPath = path.join(os.tmpdir(), `rat-m0-test-${process.pid}-${Date.now()}.sqlite`);
  db = openDb(dbPath);
  migrate(db);
  app = createApp(db);
});

afterAll(() => {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
});

describe('migrations', () => {
  const EXPECTED_TABLES = [
    'repositories',
    'identities',
    'authors',
    'identity_map',
    'commits',
    'paths',
    'dirs',
    'commit_file_stats',
    'file_current',
  ];

  it('creates the full initial schema', () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const tables = rows.map((r) => r.name);
    for (const table of EXPECTED_TABLES) {
      expect(tables).toContain(table);
    }
  });

  it('is idempotent', () => {
    expect(migrate(db)).toEqual([]);
  });
});

describe('GET /api/health', () => {
  it('reports ok with applied migrations', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: 'rat-server', db: 'ok' });
    expect(res.body.migrations).toEqual(['001_init.sql', '002_metrics_spec.sql']);
  });
});

describe('error handling', () => {
  it('returns JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });

  it('returns JSON 400 for malformed JSON bodies', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"bad json');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
