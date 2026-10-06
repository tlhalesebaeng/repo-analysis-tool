import { Router } from 'express';

/** Loads one repo row or null. */
function getRepo(db, id) {
  return db.prepare('SELECT id, name FROM repositories WHERE id = ?').get(id);
}

/**
 * Canonical authors for a repo with their mapped identities and commit counts.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {number} repoId
 */
export function listAuthors(db, repoId) {
  const authors = db
    .prepare(
      `SELECT a.id, a.display_name, a.display_email,
              (SELECT COUNT(*) FROM commits c
                 JOIN identity_map im ON im.identity_id = c.author_identity_id
                WHERE im.author_id = a.id AND c.repo_id = ?) AS commit_count
         FROM authors a WHERE a.repo_id = ? ORDER BY a.display_name COLLATE NOCASE`,
    )
    .all(repoId, repoId);
  const identities = db
    .prepare(
      `SELECT i.id, i.name, i.email, im.author_id
         FROM identities i JOIN identity_map im ON im.identity_id = i.id
        WHERE i.repo_id = ?`,
    )
    .all(repoId);
  const byAuthor = new Map();
  for (const a of authors) {
    byAuthor.set(a.id, []);
  }
  for (const i of identities) {
    byAuthor.get(i.author_id)?.push({ id: i.id, name: i.name, email: i.email });
  }
  return authors.map((a) => ({ ...a, identities: byAuthor.get(a.id) }));
}

/**
 * REST API for author identity management: listing, manual merge (the
 * mailmap-free fallback — same mechanism mailmap uses at import time), and
 * unmerge back to 1:1 identity mapping. All metric queries resolve authors
 * through identity_map, so merges apply instantly with no re-import.
 *
 * @param {{ db: import('better-sqlite3').Database }} services
 */
export function createAuthorsRouter({ db }) {
  const router = Router();

  router.get('/:id/authors', (req, res) => {
    const repoId = Number(req.params.id);
    if (!getRepo(db, repoId)) {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    res.json(listAuthors(db, repoId));
  });

  // Merge several canonical authors into one; identity_map rows are repointed
  // and emptied authors removed, inside a single transaction.
  router.post('/:id/authors/merge', (req, res) => {
    const repoId = Number(req.params.id);
    if (!getRepo(db, repoId)) {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    const ids = Array.isArray(req.body?.authorIds)
      ? [...new Set(req.body.authorIds.map(Number).filter(Number.isInteger))]
      : [];
    if (ids.length < 2) {
      return res.status(400).json({ error: 'Provide at least two authorIds to merge.' });
    }
    const rows = db
      .prepare(`SELECT id, display_name, display_email FROM authors WHERE repo_id = ? AND id IN (${ids.map(() => '?').join(',')})`)
      .all(repoId, ...ids);
    if (rows.length !== ids.length) {
      return res.status(400).json({ error: 'Some authorIds do not belong to this repository.' });
    }
    const targetId = rows[0].id;
    const others = rows.filter((r) => r.id !== targetId).map((r) => r.id);
    const displayName = typeof req.body?.displayName === 'string' && req.body.displayName.trim()
      ? req.body.displayName.trim()
      : rows[0].display_name;
    const displayEmail = typeof req.body?.displayEmail === 'string' && req.body.displayEmail.trim()
      ? req.body.displayEmail.trim()
      : rows[0].display_email;

    db.transaction(() => {
      db.prepare(
        `UPDATE identity_map SET author_id = ?
          WHERE author_id IN (${others.map(() => '?').join(',')})`,
      ).run(targetId, ...others);
      db.prepare(
        `UPDATE authors SET display_name = ?, display_email = ? WHERE id = ?`,
      ).run(displayName, displayEmail, targetId);
      db.prepare(
        `DELETE FROM authors WHERE repo_id = ? AND id IN (${others.map(() => '?').join(',')})`,
      ).run(repoId, ...others);
    })();

    res.json(listAuthors(db, repoId));
  });

  // Split one canonical author: every identity gets its own 1:1 author again.
  router.post('/:id/authors/unmerge', (req, res) => {
    const repoId = Number(req.params.id);
    if (!getRepo(db, repoId)) {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    const authorId = Number(req.body?.authorId);
    if (!Number.isInteger(authorId)) {
      return res.status(400).json({ error: 'Provide authorId.' });
    }
    const author = db
      .prepare('SELECT id FROM authors WHERE repo_id = ? AND id = ?')
      .get(repoId, authorId);
    if (!author) {
      return res.status(404).json({ error: 'Author not found.' });
    }
    const identities = db
      .prepare(
        `SELECT i.id, i.name, i.email FROM identities i
           JOIN identity_map im ON im.identity_id = i.id
          WHERE im.author_id = ? AND i.repo_id = ?`,
      )
      .all(authorId, repoId);

    db.transaction(() => {
      const insAuthor = db.prepare(
        'INSERT INTO authors (repo_id, display_name, display_email) VALUES (?, ?, ?) RETURNING id',
      );
      const repoint = db.prepare('UPDATE identity_map SET author_id = ? WHERE identity_id = ?');
      for (const identity of identities) {
        const newId = insAuthor.get(repoId, identity.name, identity.email).id;
        repoint.run(newId, identity.id);
      }
      db.prepare('DELETE FROM authors WHERE id = ?').run(authorId);
    })();

    res.json(listAuthors(db, repoId));
  });

  return router;
}
