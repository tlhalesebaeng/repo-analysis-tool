import { once } from 'node:events';
import { runGit, spawnGit } from '../git/exec.js';

/** Parent directory of a repo-relative path; '' is the root, whose parent is null. */
export function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

/**
 * Collects every ancestor directory of every path (including the root '')
 * as a Map of dir_path -> parent_dir.
 *
 * @param {string[]} paths
 */
export function collectDirs(paths) {
  const dirs = new Map();
  for (const p of paths) {
    let d = dirOf(p);
    while (d !== null && !dirs.has(d)) {
      dirs.set(d, d === '' ? null : dirOf(d));
      if (d === '') {
        break;
      }
      d = dirOf(d);
    }
  }
  return dirs;
}

/** Line count of a file blob, or null for binary content (NUL in first 8k). */
function locOf(content) {
  if (content.subarray(0, 8000).includes(0)) {
    return null;
  }
  let lines = 0;
  let idx = content.indexOf(10);
  while (idx !== -1) {
    lines++;
    idx = content.indexOf(10, idx + 1);
  }
  return lines;
}

/**
 * Lists the blobs of a tree: `git ls-tree -r -z <reference>` entries are
 * "mode SP type SP sha TAB path". Symlinks (mode 120000) and gitlinks are
 * skipped — they carry no measurable lines.
 *
 * @param {{ cwd?: string, gitDir?: string, reference: string }} opts
 * @returns {Promise<{ path: string, sha: string }[]>}
 */
async function listTreeBlobs({ cwd, gitDir, reference }) {
  const { stdout } = await runGit(['ls-tree', '-r', '-z', reference], { cwd, gitDir });
  const blobs = [];
  for (const entry of stdout.split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    if (tab === -1) {
      continue;
    }
    const [mode, type, sha] = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (type === 'blob' && mode !== '120000') {
      blobs.push({ path, sha });
    }
  }
  return blobs;
}

/**
 * Computes LOC for every blob through one streaming `git cat-file --batch`
 * conversation: SHAs are written to stdin, object contents read from stdout
 * in request order.
 *
 * @param {{ cwd?: string, gitDir?: string, blobs: { path: string, sha: string }[], onProgress?: (done: number, total: number) => void }} opts
 * @returns {Promise<Map<string, number|null>>} path -> LOC (null for binary).
 */
async function computeLoc({ cwd, gitDir, blobs, onProgress }) {
  const { child, done } = spawnGit(['cat-file', '--batch'], { cwd, gitDir, stdin: 'pipe' });
  const results = new Map();
  const pending = [...blobs];
  let buf = Buffer.alloc(0);
  // cat-file --batch emits per object: "<sha> blob <size>\n" + contents + "\n".
  // The trailing LF separator requires a three-state reader.
  let state = 'header';
  let size = 0;
  let current = null;

  const stdoutDone = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      for (;;) {
        if (state === 'lf') {
          if (buf.length === 0) {
            return;
          }
          if (buf[0] === 10) {
            buf = buf.slice(1);
          }
          state = 'header';
          continue;
        }
        if (state === 'header') {
          const nl = buf.indexOf(10);
          if (nl === -1) {
            return;
          }
          const header = buf.slice(0, nl).toString('utf8').trim();
          buf = buf.slice(nl + 1);
          const m = /^([0-9a-f]{40,64}) blob (\d+)$/.exec(header);
          if (!m) {
            reject(new Error(`cat-file: unexpected output: ${header.slice(0, 200)}`));
            return;
          }
          current = pending.shift();
          size = Number(m[2]);
          state = 'content';
          continue;
        }
        // state === 'content'
        if (buf.length < size) {
          return;
        }
        const content = buf.slice(0, size);
        buf = buf.slice(size);
        results.set(current.path, locOf(content));
        if (onProgress) {
          onProgress(results.size, blobs.length);
        }
        state = 'lf';
        current = null;
      }
    });
    child.stdout.on('end', () => {
      if (buf.length === 0 && state !== 'content') {
        resolve();
      } else {
        reject(new Error('cat-file: truncated output'));
      }
    });
    child.stdout.on('error', reject);
  });

  try {
    for (const blob of blobs) {
      if (!child.stdin.write(`${blob.sha}\n`)) {
        await once(child.stdin, 'drain');
      }
    }
    child.stdin.end();
    await stdoutDone;
    await done;
  } catch (err) {
    child.kill();
    throw err;
  }
  return results;
}

/**
 * Builds the HEAD snapshot: registers current file paths, derives the dirs
 * table from all historical paths, and stores per-file LOC.
 *
 * @param {{ db: import('better-sqlite3').Database, repoId: number, cwd?: string, gitDir?: string, reference: string, onProgress?: (done: number, total: number) => void }} opts
 */
export async function buildSnapshot({ db, repoId, cwd, gitDir, reference, onProgress }) {
  const blobs = await listTreeBlobs({ cwd, gitDir, reference });
  const currentFiles = blobs.map((b) => b.path);

  const insPath = db.prepare(
    `INSERT INTO paths (repo_id, path) VALUES (?, ?)
     ON CONFLICT (repo_id, path) DO UPDATE SET path = excluded.path
     RETURNING id`,
  );
  const pathIds = new Map();
  db.transaction(() => {
    for (const p of currentFiles) {
      pathIds.set(p, insPath.get(repoId, p).id);
    }
  })();

  const allPaths = db
    .prepare('SELECT path FROM paths WHERE repo_id = ?')
    .all(repoId)
    .map((r) => r.path);
  const dirs = collectDirs(allPaths);
  const insDir = db.prepare(
    `INSERT INTO dirs (repo_id, dir_path, parent_dir) VALUES (?, ?, ?)
     ON CONFLICT (repo_id, dir_path) DO UPDATE SET parent_dir = excluded.parent_dir`,
  );
  db.transaction(() => {
    for (const [dirPath, parentDir] of dirs) {
      insDir.run(repoId, dirPath, parentDir);
    }
  })();

  const locs = await computeLoc({ cwd, gitDir, blobs, onProgress });
  const insCurrent = db.prepare(
    `INSERT INTO file_current (repo_id, path_id, loc) VALUES (?, ?, ?)
     ON CONFLICT (repo_id, path_id) DO UPDATE SET loc = excluded.loc`,
  );
  db.transaction(() => {
    for (const [p, loc] of locs) {
      if (loc !== null) {
        insCurrent.run(repoId, pathIds.get(p), loc);
      }
    }
  })();

  return { fileCount: currentFiles.length, dirCount: dirs.size };
}
