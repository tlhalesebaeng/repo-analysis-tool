import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';

function repoSummary(db, id) {
  return db
    .prepare(
      `SELECT r.id, r.name, r.source_type, r.source_ref, r.reference, r.storage_path, r.status,
              r.progress_pct, r.phase, r.error, r.created_at,
              (SELECT COUNT(*) FROM commits c WHERE c.repo_id = r.id) AS commit_count,
              (SELECT COUNT(*) FROM paths p WHERE p.repo_id = r.id) AS path_count
       FROM repositories r WHERE r.id = ?`,
    )
    .get(id);
}

/** Appends -2, -3, ... until the name is unique. */
function uniqueName(db, base) {
  let name = base;
  let suffix = 2;
  while (db.prepare('SELECT 1 FROM repositories WHERE name = ?').get(name)) {
    name = `${base}-${suffix++}`;
  }
  return name;
}

function nameFromUrl(url) {
  try {
    const p = new URL(url).pathname.split('/').filter(Boolean).pop() ?? 'repo';
    return p.replace(/\.git$/, '') || 'repo';
  } catch {
    return 'repo';
  }
}

/**
 * REST API for repository management. POST accepts either a multipart zip
 * upload (field "file") or a JSON body {"url", "name", "reference"}; both
 * enqueue a background import whose progress is readable on the repo row.
 *
 * @param {{ db: import('better-sqlite3').Database, reposDir: string, queue: object }} services
 */
export function createReposRouter({ db, reposDir, queue }) {
  const uploadsDir = path.join(reposDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.zip`),
    }),
    fileFilter: (req, file, cb) => {
      if (file.originalname.toLowerCase().endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new Error('Only .zip files are accepted.'));
      }
    },
  });
  const uploadSingle = upload.single('file');

  const router = Router();

  router.get('/', (req, res) => {
    const rows = db
      .prepare(
        `SELECT r.id, r.name, r.source_type, r.source_ref, r.reference, r.status,
                r.progress_pct, r.phase, r.error, r.created_at,
                (SELECT COUNT(*) FROM commits c WHERE c.repo_id = r.id) AS commit_count,
                (SELECT COUNT(*) FROM paths p WHERE p.repo_id = r.id) AS path_count
         FROM repositories r ORDER BY r.id`,
      )
      .all();
    res.json(rows);
  });

  router.get('/:id', (req, res) => {
    const row = repoSummary(db, Number(req.params.id));
    if (!row) {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    res.json(row);
  });

  router.post('/', (req, res) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        if (req.file) {
          fs.rmSync(req.file.path, { force: true });
        }
        return res.status(400).json({ error: err.message });
      }
      try {
        handleCreate(req, res);
      } catch (createErr) {
        if (req.file) {
          fs.rmSync(req.file.path, { force: true });
        }
        res.status(createErr.status ?? 500).json({ error: createErr.message });
      }
    });
  });

  function handleCreate(req, res) {
    const isZip = Boolean(req.file);
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!isZip && !url) {
      throw Object.assign(
        new Error('Provide either a zip file (multipart field "file") or a JSON body with "url".'),
        { status: 400 },
      );
    }
    if (!isZip && (url.length < 8 || url.length > 2048 || !/^[a-z0-9+.-]+:\/\//i.test(url))) {
      throw Object.assign(new Error('Invalid repository URL.'), { status: 400 });
    }

    let name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) {
      name = isZip
        ? req.file.originalname.replace(/\.zip$/i, '')
        : nameFromUrl(url);
    }
    if (!name || name.length > 200) {
      throw Object.assign(new Error('Invalid repository name.'), { status: 400 });
    }
    let reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
    if (!reference) {
      reference = 'HEAD';
    }

    name = uniqueName(db, name);
    const insert = db.prepare(
      `INSERT INTO repositories (name, source_type, source_ref, storage_path, status, phase, reference)
       VALUES (?, ?, ?, ?, 'pending', 'queued', ?) RETURNING id`,
    );
    const sourceType = isZip ? 'zip' : 'url';
    const sourceRef = isZip ? req.file.originalname : url;
    const { id } = insert.get(
      name,
      sourceType,
      sourceRef,
      path.join(reposDir, 'pending'),
      reference,
    );

    if (isZip) {
      const repoDir = path.join(reposDir, String(id));
      fs.mkdirSync(repoDir, { recursive: true });
      fs.renameSync(req.file.path, path.join(repoDir, 'upload.zip'));
    }

    queue.enqueue(id);
    res.status(201).json(repoSummary(db, id));
  }

  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT id, status FROM repositories WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ error: 'Repository not found.' });
    }
    if (row.status === 'importing') {
      return res.status(409).json({ error: 'Import in progress; wait for it to finish before deleting.' });
    }
    db.prepare('DELETE FROM repositories WHERE id = ?').run(id);
    fs.rmSync(path.join(reposDir, String(id)), { recursive: true, force: true });
    res.status(204).end();
  });

  return router;
}
