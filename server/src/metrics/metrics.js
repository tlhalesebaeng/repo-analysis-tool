import { Router } from 'express';

/**
 * Metrics engine. Every metric is a query-time SQL aggregation over the fact
 * table restricted to a commit set H; nothing is precomputed, so author
 * merges and filter changes apply instantly.
 *
 * Filter semantics (per spec):
 * - fromTs INCLUSIVE, toTs EXCLUSIVE (both unix seconds, on committer_ts)
 * - authorIds restricts H (canonical authors via identity_map)
 * - commitShas is a manual selection that OVERRIDES the time range
 * - pathPrefix only selects displayed objects; it never shrinks H
 * - |H| is always computed from the restricted commit set
 */

const SORT_KEYS = ['path', 'la', 'lr', 'delta', 'churn', 'n'];

/** Parses a filter from query params. */
export function compileFilter(query = {}) {
  const num = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
  const ids = (v) =>
    typeof v === 'string' && v.length > 0
      ? v.split(',').map(Number).filter(Number.isInteger)
      : null;
  const shas = (v) =>
    typeof v === 'string' && v.length > 0
      ? v.split(',').map((s) => s.trim()).filter((s) => /^[0-9a-f]{6,40}$/i.test(s))
      : null;
  const prefix = typeof query.pathPrefix === 'string' ? query.pathPrefix.trim().replace(/\/+$/, '') : '';
  return {
    fromTs: num(query.fromTs),
    toTs: num(query.toTs),
    authorIds: ids(query.authorIds),
    commitShas: shas(query.commitShas),
    pathPrefix: prefix.length > 0 ? prefix : null,
  };
}

/**
 * Builds the restricted commit set H as SQL: non-merge commits of one repo
 * with author resolution baked in. Returns { sql, params } for use as a CTE.
 */
function hCte(repoId, f) {
  const where = ['c.repo_id = ?', 'c.is_merge = 0'];
  const params = [repoId];
  if (f.commitShas && f.commitShas.length > 0) {
    where.push(`c.sha IN (${f.commitShas.map(() => '?').join(',')})`);
    params.push(...f.commitShas);
  } else {
    if (f.fromTs !== null) {
      where.push('c.committer_ts >= ?');
      params.push(f.fromTs);
    }
    if (f.toTs !== null) {
      where.push('c.committer_ts < ?');
      params.push(f.toTs);
    }
  }
  if (f.authorIds && f.authorIds.length > 0) {
    where.push(`im.author_id IN (${f.authorIds.map(() => '?').join(',')})`);
    params.push(...f.authorIds);
  }
  return {
    sql: `SELECT c.sha, im.author_id AS author_id FROM commits c
            JOIN identity_map im ON im.identity_id = c.author_identity_id
           WHERE ${where.join(' AND ')}`,
    params,
  };
}

const LA = 'COALESCE(f.lines_added, 0)';
const LR = 'COALESCE(f.lines_removed, 0)';

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** WHERE fragment matching objects at pathPrefix or below it. */
function prefixClause(f) {
  if (!f.pathPrefix) {
    return { sql: '', params: [] };
  }
  const esc = escapeLike(f.pathPrefix);
  return { sql: ' AND (p.path = ? OR p.path LIKE ? ESCAPE ?)', params: [f.pathPrefix, `${esc}/%`, '\\'] };
}

/** |H| for the restricted commit set. */
function hSize(db, repoId, h) {
  return db.prepare(`SELECT COUNT(*) AS n FROM (${h.sql})`).get(...h.params).n;
}

/**
 * Per-file commit-set metrics, one pass over the facts joined to H.
 * Returns [{ pathId, path, la, lr, n }] plus the author breakdown when asked.
 */
function fileAggs(db, repoId, h, { withAuthors = false } = {}) {
  const pfx = prefixClause(h.f);
  const base = `WITH h AS (${h.sql})
    SELECT p.id AS path_id, p.path,
           SUM(${LA}) AS la, SUM(${LR}) AS lr,
           SUM(CASE WHEN ${LA} + ${LR} > 0 THEN 1 ELSE 0 END) AS n
      FROM commit_file_stats f
      JOIN h ON h.sha = f.commit_sha
      JOIN paths p ON p.id = f.path_id
     WHERE f.repo_id = ?${pfx.sql}
     GROUP BY p.id, p.path`;
  const rows = db.prepare(base).all(...h.params, repoId, ...pfx.params);

  let authorRows = [];
  if (withAuthors) {
    authorRows = db
      .prepare(
        `WITH h AS (${h.sql})
         SELECT f.path_id, a.id AS author_id, a.display_name AS author,
                SUM(${LA}) AS la, SUM(${LR}) AS lr,
                SUM(CASE WHEN ${LA} + ${LR} > 0 THEN 1 ELSE 0 END) AS n
           FROM commit_file_stats f
           JOIN h ON h.sha = f.commit_sha
           JOIN authors a ON a.id = h.author_id
          WHERE f.repo_id = ?
          GROUP BY f.path_id, a.id`,
      )
      .all(...h.params, repoId);
  }
  return { rows, authorRows };
}

/** Repository (root) totals over H. */
function repoTotals(db, repoId, h) {
  return db
    .prepare(
      `WITH h AS (${h.sql})
       SELECT COALESCE(SUM(${LA}), 0) AS la, COALESCE(SUM(${LR}), 0) AS lr,
              COUNT(DISTINCT f.path_id) AS files_touched,
              COUNT(DISTINCT CASE WHEN ${LA} + ${LR} > 0 THEN h.sha END) AS n
         FROM commit_file_stats f JOIN h ON h.sha = f.commit_sha
        WHERE f.repo_id = ?`,
    )
    .get(...h.params, repoId);
}

/** Author metrics on the root object (author totals). */
function authorAggs(db, repoId, h) {
  return db
    .prepare(
      `WITH h AS (${h.sql})
       SELECT a.id AS author_id, a.display_name, a.display_email,
              COUNT(DISTINCT h.sha) AS commits,
              COALESCE(SUM(${LA}), 0) AS la, COALESCE(SUM(${LR}), 0) AS lr,
              COUNT(DISTINCT CASE WHEN ${LA} + ${LR} > 0 THEN h.sha END) AS n
         FROM h JOIN authors a ON a.id = h.author_id
         LEFT JOIN commit_file_stats f ON f.commit_sha = h.sha AND f.repo_id = ?
        GROUP BY a.id ORDER BY la + lr DESC`,
    )
    .all(...h.params, repoId);
}

/** Monthly buckets of commit count, churn, and growth over H. */
function timeline(db, repoId, h) {
  return db
    .prepare(
      `WITH h AS (${h.sql})
       SELECT strftime('%Y-%m', c.committer_ts, 'unixepoch') AS month,
              COUNT(DISTINCT c.sha) AS commits,
              COALESCE(SUM(${LA}), 0) AS la, COALESCE(SUM(${LR}), 0) AS lr
         FROM (SELECT sha, committer_ts FROM commits WHERE repo_id = ? AND is_merge = 0) c
         JOIN h ON h.sha = c.sha
         LEFT JOIN commit_file_stats f ON f.commit_sha = c.sha AND f.repo_id = ?
        GROUP BY month ORDER BY month`,
    )
    .all(...h.params, repoId, repoId);
}

/** Derives the metric registry values (η, ρ guarded) shared by all shapes. */
function withDerived(row, size) {
  const la = row.la ?? 0;
  const lr = row.lr ?? 0;
  return {
    ...row,
    la,
    lr,
    delta: la - lr,
    churn: la + lr,
    n: row.n ?? 0,
    eta: size > 0 ? (row.n ?? 0) / size : 0,
    rho: size > 0 ? (la + lr) / size : 0,
  };
}

/** Total current LOC of the repo snapshot (independent of H). */
function totalLoc(db, repoId) {
  return db.prepare('SELECT COALESCE(SUM(loc), 0) AS loc FROM file_current WHERE repo_id = ?').get(repoId).loc;
}

function buildSummary(db, repoId, h) {
  const size = hSize(db, repoId, h);
  const totals = repoTotals(db, repoId, h);
  const authors = authorAggs(db, repoId, h).map((a) => ({
    ...withDerived(a, size),
    omega: totals.la + totals.lr > 0 ? (a.la + a.lr) / (totals.la + totals.lr) : 0,
  }));
  return {
    hSize: size,
    ...withDerived({ la: totals.la, lr: totals.lr, n: totals.n }, size),
    filesTouched: totals.files_touched,
    loc: totalLoc(db, repoId),
    authorCount: authors.length,
    timeline: timeline(db, repoId, h).map((t) => ({
      month: t.month,
      commits: t.commits,
      churn: t.la + t.lr,
      growth: t.la - t.lr,
    })),
    topAuthors: authors.slice(0, 10),
  };
}

/**
 * REST API for metrics and the commit browser, scoped per repository.
 *
 * @param {{ db: import('better-sqlite3').Database }} services
 */
export function createMetricsRouter({ db }) {
  const router = Router();

  const loadRepo = (req, res) => {
    const repoId = Number(req.params.id);
    const repo = db.prepare('SELECT id, name FROM repositories WHERE id = ?').get(repoId);
    if (!repo) {
      res.status(404).json({ error: 'Repository not found.' });
      return null;
    }
    return repoId;
  };

  router.get('/:id/metrics/summary', (req, res) => {
    const repoId = loadRepo(req, res);
    if (!repoId) return;
    res.json(buildSummary(db, repoId, hCte(repoId, compileFilter(req.query))));
  });

  router.get('/:id/metrics/files', (req, res) => {
    const repoId = loadRepo(req, res);
    if (!repoId) return;
    const f = compileFilter(req.query);
    const h = hCte(repoId, f);
    const size = hSize(db, repoId, h);
    const { rows, authorRows } = fileAggs(db, repoId, { ...h, f }, { withAuthors: true });

    const byPath = new Map();
    for (const r of rows) {
      byPath.set(r.path_id, { ...withDerived(r, size), authors: [] });
    }
    const locRows = db
      .prepare(
        `SELECT fc.path_id, fc.loc FROM file_current fc
          WHERE fc.repo_id = ?${f.pathPrefix ? ' AND fc.path_id IN (SELECT id FROM paths WHERE repo_id = ? AND (path = ? OR path LIKE ? ESCAPE ?))' : ''}`,
      )
      .all(...(f.pathPrefix ? [repoId, repoId, f.pathPrefix, `${escapeLike(f.pathPrefix)}/%`, '\\'] : [repoId]));
    const locByPath = new Map(locRows.map((r) => [r.path_id, r.loc]));

    for (const a of authorRows) {
      const file = byPath.get(a.path_id);
      if (!file) continue;
      const churn = a.la + a.lr;
      file.authors.push({
        authorId: a.author_id,
        author: a.author,
        la: a.la,
        lr: a.lr,
        churn,
        omega: file.churn > 0 ? churn / file.churn : 0,
      });
    }
    for (const row of byPath.values()) {
      row.loc = locByPath.get(row.path_id) ?? null;
      row.authors.sort((x, y) => y.churn - x.churn);
    }

    const sortBy = SORT_KEYS.includes(req.query.sortBy) ? req.query.sortBy : 'churn';
    const dir = req.query.sortDir === 'asc' ? 1 : -1;
    const all = [...byPath.values()].sort((a, b) => {
      const d = sortBy === 'path' ? a.path.localeCompare(b.path) : a[sortBy] - b[sortBy];
      return d * dir;
    });
    const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 5000);
    res.json({ hSize: size, total: all.length, rows: all.slice(0, limit) });
  });

  router.get('/:id/metrics/dirs', (req, res) => {
    const repoId = loadRepo(req, res);
    if (!repoId) return;
    const f = compileFilter(req.query);
    const h = hCte(repoId, f);
    const size = hSize(db, repoId, h);
    const { rows } = fileAggs(db, repoId, { ...h, f });
    const dirs = db
      .prepare('SELECT dir_path, parent_dir FROM dirs WHERE repo_id = ?')
      .all(repoId);
    const pathRows = db
      .prepare(
        `SELECT id, path FROM paths WHERE repo_id = ?${f.pathPrefix ? ' AND (path = ? OR path LIKE ? ESCAPE ?)' : ''}`,
      )
      .all(...(f.pathPrefix ? [repoId, f.pathPrefix, `${escapeLike(f.pathPrefix)}/%`, '\\'] : [repoId]));

    const agg = new Map(dirs.map((d) => [d.dir_path, { la: 0, lr: 0, n: 0, files: 0 }]));
    agg.set('', { la: 0, lr: 0, n: 0, files: 0 });
    const factByPath = new Map(rows.map((r) => [r.path_id, r]));
    const parentOf = (d) => (d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '');

    for (const p of pathRows) {
      const fact = factByPath.get(p.id);
      // Every directory on the path's ancestor chain contains the file in
      // its subtree, so the file's metrics roll into each ancestor.
      for (let dir = parentOf(p.path); ; dir = parentOf(dir)) {
        const a = agg.get(dir);
        if (a) {
          a.files += 1;
          if (fact) {
            a.la += fact.la;
            a.lr += fact.lr;
            a.n += fact.n;
          }
        }
        if (dir === '') break;
      }
    }

    const out = [...agg.entries()]
      .map(([dirPath, a]) => ({
        dirPath,
        ...withDerived(a, size),
        files: a.files,
        depth: dirPath === '' ? 0 : dirPath.split('/').length,
      }))
      .filter((d) => d.files > 0 || d.dirPath === '')
      .sort((a, b) => a.dirPath.localeCompare(b.dirPath));
    res.json({ hSize: size, rows: out });
  });

  router.get('/:id/metrics/authors', (req, res) => {
    const repoId = loadRepo(req, res);
    if (!repoId) return;
    const h = hCte(repoId, compileFilter(req.query));
    const size = hSize(db, repoId, h);
    const totals = repoTotals(db, repoId, h);
    const totalChurn = totals.la + totals.lr;
    res.json({
      hSize: size,
      rows: authorAggs(db, repoId, h).map((a) => ({
        ...withDerived(a, size),
        omega: totalChurn > 0 ? (a.la + a.lr) / totalChurn : 0,
      })),
    });
  });

  router.get('/:id/metrics/commit-set', (req, res) => {
    const repoId = loadRepo(req, res);
    if (!repoId) return;
    const f = compileFilter(req.query);
    if (!f.commitShas || f.commitShas.length === 0) {
      return res.status(400).json({ error: 'Provide commitShas (comma-separated).'});
    }
    res.json(buildSummary(db, repoId, hCte(repoId, f)));
  });

  // Commit browser: paginated, searchable, filter-aware. pathId switches it
  // into a per-commit drill-down of one file's primitives (category 1).
  router.get('/:id/commits', (req, res) => {
    const repoId = loadRepo(req, res);
    if (!repoId) return;
    const f = compileFilter(req.query);
    const h = hCte(repoId, f);
    const pathId = Number(req.query.pathId);
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (Number.isInteger(pathId) && pathId > 0) {
      const rows = db
        .prepare(
          `WITH h AS (${h.sql})
           SELECT c.sha, substr(c.sha, 1, 10) AS short_sha, c.message, c.committer_ts,
                  a.display_name AS author,
                  f.lines_added AS la, f.lines_removed AS lr, f.is_binary, f.is_rename,
                  op.path AS old_path
             FROM commit_file_stats f
             JOIN commits c ON c.repo_id = f.repo_id AND c.sha = f.commit_sha
             JOIN h ON h.sha = c.sha
             JOIN identity_map im ON im.identity_id = c.author_identity_id
             JOIN authors a ON a.id = im.author_id
             LEFT JOIN paths op ON op.id = f.old_path_id
            WHERE f.repo_id = ? AND f.path_id = ?
            ORDER BY c.committer_ts DESC LIMIT 500`,
        )
        .all(...h.params, repoId, pathId);
      return res.json({ rows });
    }

    const where = ['c.repo_id = ?', 'c.is_merge = 0'];
    const params = [repoId];
    if (f.commitShas && f.commitShas.length > 0) {
      where.push(`c.sha IN (${f.commitShas.map(() => '?').join(',')})`);
      params.push(...f.commitShas);
    } else {
      if (f.fromTs !== null) {
        where.push('c.committer_ts >= ?');
        params.push(f.fromTs);
      }
      if (f.toTs !== null) {
        where.push('c.committer_ts < ?');
        params.push(f.toTs);
      }
    }
    if (f.authorIds && f.authorIds.length > 0) {
      where.push(`im.author_id IN (${f.authorIds.map(() => '?').join(',')})`);
      params.push(...f.authorIds);
    }
    if (q) {
      where.push('c.message LIKE ? ESCAPE ?');
      params.push(`%${escapeLike(q)}%`, '\\');
    }
    const base = `FROM commits c
            JOIN identity_map im ON im.identity_id = c.author_identity_id
            JOIN authors a ON a.id = im.author_id
           WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params).n;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const commits = db
      .prepare(
        `SELECT c.sha, substr(c.sha, 1, 10) AS short_sha, c.message, c.committer_ts, c.parent_count,
                a.id AS author_id, a.display_name AS author ${base}
          ORDER BY c.committer_ts DESC, c.sha LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);

    if (commits.length > 0) {
      const shas = commits.map((c) => c.sha);
      const churn = db
        .prepare(
          `SELECT commit_sha, COALESCE(SUM(${LA}), 0) AS la, COALESCE(SUM(${LR}), 0) AS lr
             FROM commit_file_stats f WHERE f.repo_id = ? AND f.commit_sha IN (${shas.map(() => '?').join(',')})
            GROUP BY commit_sha`,
        )
        .all(repoId, ...shas);
      const bySha = new Map(churn.map((c) => [c.commit_sha, c]));
      for (const c of commits) {
        const s = bySha.get(c.sha);
        c.la = s?.la ?? 0;
        c.lr = s?.lr ?? 0;
      }
    }
    res.json({ total, limit, offset, rows: commits });
  });

  return router;
}
