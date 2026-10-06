import fs from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/connection.js';
import { migrate } from './db/migrate.js';

const config = loadConfig();
fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.reposDir, { recursive: true });

const db = openDb(config.dbPath);
const applied = migrate(db);
if (applied.length > 0) {
  console.log(`[rat] applied migrations: ${applied.join(', ')}`);
}

const app = createApp(db);
const server = app.listen(config.port, config.host, () => {
  console.log(`[rat] api listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[rat] received ${signal}, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
