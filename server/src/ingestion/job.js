import fs from 'node:fs';
import path from 'node:path';
import { runGit } from '../git/exec.js';
import { cloneMirror } from './clone.js';
import { insertHistory, streamGitLog } from './extract.js';
import { applyMailmap, parseMailmap, readMailmap } from './mailmap.js';
import { buildSnapshot } from './snapshot.js';
import { extractZip } from './zip.js';

/** Phase progress allocation across an import: acquire 0-10, extract 10-85, snapshot 85-95, mailmap 95-100. */

/**
 * Returns the git execution context for a storage directory: worktree repos
 * run with cwd, bare mirrors with --git-dir.
 *
 * @param {string} storage
 */
export function resolveGitContext(storage) {
  const dotGit = path.join(storage, '.git');
  if (fs.existsSync(dotGit)) {
    if (fs.statSync(dotGit).isDirectory()) {
      return { cwd: storage };
    }
    throw new Error(
      'Repository uses a .git file pointer (submodule or linked worktree); a repository with a full .git directory is required.',
    );
  }
  const bare = ['HEAD', 'objects', 'refs'].every((e) => fs.existsSync(path.join(storage, e)));
  if (bare) {
    return { gitDir: storage };
  }
  throw new Error(`${storage} is not a git repository`);
}

/** Descends through a single top-level directory to find the repository root. */
function locateRepository(dir) {
  try {
    resolveGitContext(dir);
    return dir;
  } catch (err) {
    const entries = fs
      .readdirSync(dir)
      .filter((n) => !n.startsWith('__MACOSX') && n !== '.DS_Store');
    if (entries.length === 1) {
      const child = path.join(dir, entries[0]);
      if (fs.statSync(child).isDirectory()) {
        return locateRepository(child);
      }
    }
    throw new Error(
      'No git repository found (expected a .git directory or a bare repository layout).',
      { cause: err },
    );
  }
}

/** Wipes all extracted data for a repo so imports are restartable. */
function clearRepoData(db, repoId) {
  db.transaction(() => {
    // Order matters: commits first (cascades commit_file_stats, which
    // reference paths via old_path_id), then paths, identities, authors, dirs.
    db.prepare('DELETE FROM commits WHERE repo_id = ?').run(repoId);
    db.prepare('DELETE FROM paths WHERE repo_id = ?').run(repoId);
    db.prepare('DELETE FROM identities WHERE repo_id = ?').run(repoId);
    db.prepare('DELETE FROM authors WHERE repo_id = ?').run(repoId);
    db.prepare('DELETE FROM dirs WHERE repo_id = ?').run(repoId);
  })();
}

/**
 * Runs one import job through all phases, updating repository progress as it
 * goes. Throws on failure; the queue records the error on the repo row.
 *
 * @param {{ db: import('better-sqlite3').Database, reposDir: string, repoId: number }} opts
 */
export async function runImportJob({ db, reposDir, repoId }) {
  const repo = db.prepare('SELECT * FROM repositories WHERE id = ?').get(repoId);
  if (!repo) {
    return;
  }
  const setProgress = (phase, pct) =>
    db
      .prepare('UPDATE repositories SET status = ?, phase = ?, progress_pct = ? WHERE id = ?')
      .run('importing', phase, pct, repoId);

  setProgress('acquire', 0);
  clearRepoData(db, repoId);

  const baseDir = path.join(reposDir, String(repoId));
  // Wipe any previous attempt's output but keep upload.zip so failed zip
  // imports can be retried after a restart.
  if (fs.existsSync(baseDir)) {
    for (const entry of fs.readdirSync(baseDir)) {
      if (entry !== 'upload.zip') {
        fs.rmSync(path.join(baseDir, entry), { recursive: true, force: true });
      }
    }
  }
  fs.mkdirSync(baseDir, { recursive: true });

  if (repo.source_type === 'zip') {
    await extractZip(path.join(baseDir, 'upload.zip'), path.join(baseDir, 'src'));
    fs.rmSync(path.join(baseDir, 'upload.zip'), { force: true });
  } else {
    await cloneMirror({
      url: repo.source_ref,
      dest: path.join(baseDir, 'src'),
      onProgress: (pct) => setProgress('acquire', Math.floor(pct / 10)),
    });
  }

  const storage = locateRepository(path.join(baseDir, 'src'));
  db.prepare('UPDATE repositories SET storage_path = ? WHERE id = ?').run(storage, repoId);
  const ctx = resolveGitContext(storage);
  const reference = repo.reference ?? 'HEAD';
  try {
    await runGit(['rev-parse', '--verify', `${reference}^{commit}`], ctx);
  } catch {
    // Covers unborn HEAD (fresh repo or mis-pointed mirror) and bad names.
    throw new Error(`Reference "${reference}" does not resolve to a commit in this repository.`);
  }

  setProgress('extract', 10);
  const { stdout } = await runGit(['rev-list', '--count', '--no-merges', reference], ctx);
  const totalCommits = Number(stdout.trim()) || 0;
  let reportedPct = 10;
  const updatePct = db.prepare('UPDATE repositories SET progress_pct = ? WHERE id = ?');
  const parsed = await streamGitLog({
    ...ctx,
    reference,
    onCommit: (count) => {
      const pct = Math.min(10 + Math.floor((75 * count) / Math.max(totalCommits, 1)), 85);
      if (pct > reportedPct) {
        reportedPct = pct;
        updatePct.run(pct, repoId);
      }
    },
  });
  insertHistory(db, repoId, parsed);

  setProgress('snapshot', 85);
  await buildSnapshot({
    db,
    repoId,
    ...ctx,
    reference,
    onProgress: (done, total) => {
      const pct = 85 + Math.floor((10 * done) / Math.max(total, 1));
      if (pct > reportedPct) {
        reportedPct = pct;
        updatePct.run(Math.min(pct, 95), repoId);
      }
    },
  });

  setProgress('mailmap', 95);
  const mailmapText = await readMailmap({ ...ctx, reference });
  if (mailmapText) {
    applyMailmap(db, repoId, parseMailmap(mailmapText));
  }

  db.prepare(
    "UPDATE repositories SET status = 'ready', phase = 'done', progress_pct = 100, error = NULL WHERE id = ?",
  ).run(repoId);
}
