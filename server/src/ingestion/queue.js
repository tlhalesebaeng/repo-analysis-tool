import { runImportJob } from './job.js';

/**
 * Single-worker FIFO import queue. Imports are CPU/IO-bound git and SQLite
 * work; serializing them keeps memory bounded and WAL contention-free, which
 * matters at ~100k-commit scale. Progress is observable on the repo rows.
 */
export class ImportQueue {
  /** @param {{ db: import('better-sqlite3').Database, reposDir: string }} opts */
  constructor({ db, reposDir }) {
    this.db = db;
    this.reposDir = reposDir;
    this.ids = [];
    this.running = false;
  }

  /** @param {number} repoId */
  enqueue(repoId) {
    this.ids.push(repoId);
    this.pump();
  }

  pump() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.drain().finally(() => {
      this.running = false;
    });
  }

  async drain() {
    while (this.ids.length > 0) {
      const repoId = this.ids.shift();
      try {
        await runImportJob({ db: this.db, reposDir: this.reposDir, repoId });
      } catch (err) {
        this.db
          .prepare("UPDATE repositories SET status = 'failed', error = ? WHERE id = ?")
          .run(String(err?.message ?? err), repoId);
      }
    }
  }
}
