import fs from 'node:fs';
import path from 'node:path';
import { runGit } from '../git/exec.js';

/**
 * Parses .mailmap content. Each entry maps commit identities to a canonical
 * (name, email) pair, supporting git's four line forms:
 *   Proper Name <proper@email>
 *   <proper@email> <commit@email>
 *   Proper Name <proper@email> <commit@email>
 *   Proper Name <proper@email> Commit Name <commit@email>
 *
 * @param {string} text
 * @returns {{ properName: string|null, properEmail: string, commitName: string|null, commitEmail: string|null }[]}
 */
export function parseMailmap(text) {
  const entries = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const parts = line.split(/<([^>]*)>/);
    if (parts.length === 3) {
      const properName = parts[0].trim() || null;
      entries.push({ properName, properEmail: parts[1].trim(), commitName: null, commitEmail: null });
    } else if (parts.length === 5) {
      const properName = parts[0].trim() || null;
      const commitName = parts[2].trim() || null;
      entries.push({
        properName,
        properEmail: parts[1].trim(),
        commitName,
        commitEmail: parts[3].trim(),
      });
    }
  }
  return entries;
}

/** First mailmap entry matching an identity (git semantics: first match wins). */
function findEntry(entries, identity) {
  for (const e of entries) {
    if (e.commitEmail !== null) {
      if (identity.email !== e.commitEmail) {
        continue;
      }
      if (e.commitName && identity.name !== e.commitName) {
        continue;
      }
    } else if (identity.email !== e.properEmail) {
      continue;
    }
    return e;
  }
  return null;
}

/**
 * Applies mailmap entries by repointing identity_map rows at canonical
 * authors (creating them as needed) and removing default authors left with
 * no identities. Returns the number of identities remapped.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} repoId
 * @param {object[]} entries parsed mailmap entries
 */
export function applyMailmap(db, repoId, entries) {
  if (entries.length === 0) {
    return 0;
  }
  const identities = db
    .prepare('SELECT id, name, email FROM identities WHERE repo_id = ?')
    .all(repoId);
  const insAuthor = db.prepare(
    `INSERT INTO authors (repo_id, display_name, display_email) VALUES (?, ?, ?) RETURNING id`,
  );
  const findAuthor = db.prepare(
    `SELECT id FROM authors WHERE repo_id = ? AND display_name = ? AND display_email = ?`,
  );
  const upMap = db.prepare(
    `INSERT INTO identity_map (identity_id, author_id) VALUES (?, ?)
     ON CONFLICT (identity_id) DO UPDATE SET author_id = excluded.author_id`,
  );

  let merged = 0;
  db.transaction(() => {
    for (const identity of identities) {
      const entry = findEntry(entries, identity);
      if (!entry) {
        continue;
      }
      const name = entry.properName ?? identity.name;
      const email = entry.properEmail;
      let authorId = findAuthor.get(repoId, name, email)?.id;
      if (!authorId) {
        authorId = insAuthor.get(repoId, name, email).id;
      }
      upMap.run(identity.id, authorId);
      merged++;
    }
    db.prepare(
      `DELETE FROM authors WHERE repo_id = ? AND id NOT IN (SELECT author_id FROM identity_map)`,
    ).run(repoId);
  })();
  return merged;
}

/**
 * Reads the mailmap for a repository: worktree file first, then the blob at
 * <reference>:.mailmap. Returns null when neither exists.
 *
 * @param {{ cwd?: string, gitDir?: string, reference: string }} opts
 * @returns {Promise<string|null>}
 */
export async function readMailmap({ cwd, gitDir, reference }) {
  if (cwd) {
    const worktreeFile = path.join(cwd, '.mailmap');
    if (fs.existsSync(worktreeFile)) {
      return fs.promises.readFile(worktreeFile, 'utf8');
    }
  }
  try {
    const { stdout } = await runGit(['show', `${reference}:.mailmap`], { cwd, gitDir });
    return stdout.trim() ? stdout : null;
  } catch {
    return null; // no mailmap blob at the reference
  }
}
