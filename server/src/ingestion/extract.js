import { forEachLine, spawnGit } from '../git/exec.js';

const REC = '\x1e'; // record separator between commits
const FIELD = '\x1f'; // field separator within a commit header
const FORMAT = '%x1e%H%x1f%an%x1f%ae%x1f%cI%x1f%aI%x1f%P%x1f%s';
const INSERT_CHUNK = 50_000;

function unixTs(iso) {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/**
 * Splits a numstat path field into old/new path parts, handling both the full
 * rename form ("old => new") and the brace shorthand ("src/{a => b}.py").
 * Non-renames return { oldPath: null, newPath: p }.
 */
export function splitRename(p) {
  const braceOpen = p.indexOf('{');
  if (braceOpen !== -1) {
    const braceClose = p.indexOf('}', braceOpen);
    if (braceClose !== -1) {
      const inner = p.slice(braceOpen + 1, braceClose);
      const arrow = inner.indexOf(' => ');
      if (arrow !== -1) {
        const prefix = p.slice(0, braceOpen);
        const suffix = p.slice(braceClose + 1);
        return {
          oldPath: prefix + inner.slice(0, arrow) + suffix,
          newPath: prefix + inner.slice(arrow + 4) + suffix,
        };
      }
    }
  }
  const arrow = p.indexOf(' => ');
  if (arrow !== -1) {
    return { oldPath: p.slice(0, arrow), newPath: p.slice(arrow + 4) };
  }
  return { oldPath: null, newPath: p };
}

/**
 * Parses one `git log --numstat` line ("added\tremoved\tpath").
 * Returns null for non-numstat lines. Binary files ("-") get null line counts.
 *
 * @param {string} line
 */
export function parseNumstatLine(line) {
  const t1 = line.indexOf('\t');
  if (t1 === -1) {
    return null;
  }
  const t2 = line.indexOf('\t', t1 + 1);
  if (t2 === -1) {
    return null;
  }
  const added = line.slice(0, t1);
  const removed = line.slice(t1 + 1, t2);
  let pathField = line.slice(t2 + 1);
  if (pathField.startsWith('"') && pathField.endsWith('"')) {
    pathField = pathField.slice(1, -1);
  }
  const { oldPath, newPath } = splitRename(pathField);
  const isBinary = added === '-' || removed === '-';
  return {
    newPath,
    oldPath,
    linesAdded: isBinary ? null : Number(added) || 0,
    linesRemoved: isBinary ? null : Number(removed) || 0,
    isBinary,
  };
}

/**
 * Streams `git log <reference> --no-merges -M50 --numstat` and returns the
 * full parsed history. Streams line-by-line so memory stays proportional to
 * the history size, not the git output (which is several times larger).
 *
 * @param {{ cwd?: string, gitDir?: string, reference: string, onCommit?: (count: number) => void }} opts
 * @returns {Promise<{commits: object[], facts: object[], identities: object[], paths: string[]}>}
 */
export async function streamGitLog({ cwd, gitDir, reference, onCommit }) {
  const { child, done } = spawnGit(
    ['log', reference, '--no-merges', '-M50', '--numstat', `--format=${FORMAT}`],
    { cwd, gitDir },
  );
  const commits = [];
  const facts = [];
  const identityKeys = new Set();
  const pathKeys = new Set();
  let current = null;

  await forEachLine(child.stdout, (line) => {
    if (line.startsWith(REC)) {
      const f = line.slice(1).split(FIELD);
      current = {
        sha: f[0],
        authorName: f[1],
        authorEmail: f[2],
        committerTs: unixTs(f[3]),
        authorTs: unixTs(f[4]),
        parentCount: f[5] ? f[5].split(' ').filter(Boolean).length : 0,
        message: f[6],
      };
      commits.push(current);
      identityKeys.add(`${f[1]}\u0000${f[2]}`);
      if (onCommit) {
        onCommit(commits.length);
      }
    } else if (line.length > 0 && current) {
      const stat = parseNumstatLine(line);
      if (stat) {
        facts.push({ sha: current.sha, ...stat });
        pathKeys.add(stat.newPath);
        if (stat.oldPath) {
          pathKeys.add(stat.oldPath);
        }
      }
    }
  });
  await done;

  const identities = [...identityKeys].map((key) => {
    const [name, email] = key.split('\u0000');
    return { name, email };
  });
  return { commits, facts, identities, paths: [...pathKeys] };
}

/**
 * Persists parsed history: identities (+1:1 default authors), paths, commits,
 * and file-change facts, in chunked transactions for import speed.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} repoId
 */
export function insertHistory(db, repoId, { commits, facts, identities, paths }) {
  const identityIds = new Map();
  const pathIds = new Map();

  const insIdentity = db.prepare(
    `INSERT INTO identities (repo_id, name, email) VALUES (?, ?, ?)
     ON CONFLICT (repo_id, name, email) DO UPDATE SET name = excluded.name
     RETURNING id`,
  );
  const insAuthor = db.prepare(
    `INSERT INTO authors (repo_id, display_name, display_email) VALUES (?, ?, ?) RETURNING id`,
  );
  const insIdentityMap = db.prepare(
    `INSERT INTO identity_map (identity_id, author_id) VALUES (?, ?)
     ON CONFLICT (identity_id) DO UPDATE SET author_id = excluded.author_id`,
  );
  const insPath = db.prepare(
    `INSERT INTO paths (repo_id, path) VALUES (?, ?)
     ON CONFLICT (repo_id, path) DO UPDATE SET path = excluded.path
     RETURNING id`,
  );
  const insCommit = db.prepare(
    `INSERT INTO commits (repo_id, sha, author_identity_id, committer_ts, author_ts, message, parent_count, is_merge)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  const insFact = db.prepare(
    `INSERT INTO commit_file_stats (repo_id, commit_sha, path_id, old_path_id, lines_added, lines_removed, is_binary, is_rename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertChunked = (total, chunkSize, runOne) => {
    for (let start = 0; start < total; start += chunkSize) {
      const end = Math.min(start + chunkSize, total);
      db.transaction(() => {
        for (let i = start; i < end; i++) {
          runOne(i);
        }
      })();
    }
  };

  insertChunked(identities.length, INSERT_CHUNK, (i) => {
    const { name, email } = identities[i];
    const identityId = insIdentity.get(repoId, name, email).id;
    identityIds.set(`${name}\u0000${email}`, identityId);
    const authorId = insAuthor.get(repoId, name, email).id;
    insIdentityMap.run(identityId, authorId);
  });

  insertChunked(paths.length, INSERT_CHUNK, (i) => {
    pathIds.set(paths[i], insPath.get(repoId, paths[i]).id);
  });

  insertChunked(commits.length, INSERT_CHUNK, (i) => {
    const c = commits[i];
    const identityId = identityIds.get(`${c.authorName}\u0000${c.authorEmail}`);
    insCommit.run(
      repoId,
      c.sha,
      identityId,
      c.committerTs,
      c.authorTs,
      c.message,
      c.parentCount,
    );
  });

  insertChunked(facts.length, INSERT_CHUNK, (i) => {
    const f = facts[i];
    insFact.run(
      repoId,
      f.sha,
      pathIds.get(f.newPath),
      f.oldPath ? (pathIds.get(f.oldPath) ?? null) : null,
      f.linesAdded,
      f.linesRemoved,
      f.isBinary ? 1 : 0,
      f.oldPath ? 1 : 0,
    );
  });

  return { commitCount: commits.length, factCount: facts.length };
}
