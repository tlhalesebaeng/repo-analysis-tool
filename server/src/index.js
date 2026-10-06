import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { ImportQueue } from './ingestion/queue.js';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.reposDir, { recursive: true });

const db = openDb(config.dbPath);
const applied = migrate(db);
if (applied.length > 0) {
  console.log(`[rat] applied migrations: ${applied.join(', ')}`);
}

const queue = new ImportQueue({ db, reposDir: config.reposDir });
const app = createApp(db, { reposDir: config.reposDir, queue });
const server = app.listen(config.port, config.host, () => {
  console.log(`[rat] api listening on http://${config.host}:${config.port}`);
});

// Re-enqueue imports interrupted by a restart; jobs are restartable from
// scratch because each one wipes prior repo data first.
const stale = db
  .prepare("SELECT id FROM repositories WHERE status IN ('pending', 'importing')")
  .all();
const reset = db.prepare(
  "UPDATE repositories SET status = 'pending', progress_pct = 0, phase = 'queued', error = NULL WHERE id = ?",
);
for (const { id } of stale) {
  reset.run(id);
  queue.enqueue(id);
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[rat] received ${signal}, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
