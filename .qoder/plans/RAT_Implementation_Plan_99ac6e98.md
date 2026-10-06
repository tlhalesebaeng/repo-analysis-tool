# RAT (Repo Analysis Tool) — Implementation Plan

## Architecture Overview

```
web/ (React + TS + Vite SPA)  ──/api proxy──►  server/ (Express + TS)
                                                ├── api/        REST routers
                                                ├── ingestion/  job queue, zip/clone, extractor
                                                ├── authors/    identity model, mailmap, merges
                                                ├── metrics/    filter builder + metrics registry
                                                └── db/         better-sqlite3 (WAL)
data/ (gitignored): data/rat.sqlite + data/repos/<repoId>/   (extracted zips, mirrors)
```

- npm workspaces monorepo (`server/`, `web/`); `npm run dev` starts Express (3001) + Vite (5173, `/api` proxy) via concurrently.
- System `git` CLI invoked through `child_process.spawn` with streaming stdout (no nodegit — avoids native build/libgit2 divergence). Prerequisite: git installed.
- Local single-user: no auth, in-process import worker.

## Key Design Decisions

1. **Metric-agnostic raw fact store (central decision).** The final metric list is pending, so we persist per-commit-per-file change records and compute every metric as SQL `GROUP BY` at query time. Adding a metric later = adding an aggregation expression, never a re-import.
2. **Author merging is a mapping update, not a recomputation.** Git identities `(name, email)` map many-to-one to canonical authors via `identity_map`. Mailmap and manual merges only rewrite this table; every metric query joins through it, so merges (and unmerges) apply instantly across all views.
3. **Star schema in SQLite** with `better-sqlite3` (synchronous, WAL, batched transactional inserts).
4. **Metrics registry**: each metric = `{ key, label, category, applicability, sqlExpr }`. A provisional count-based set ships first; the user's real list plugs in here (plus optional raw inputs like blame).
5. **Imports run as background jobs** (single in-process queue) with per-phase progress, polled by the UI — repos can be large; the UI must stay responsive.

## Data Model (server/src/db/schema.sql)

- `repositories(id, name, source_type 'zip'|'url', source_ref, storage_path, status 'pending'|'importing'|'ready'|'failed', progress_pct, phase, error, created_at)`
- `identities(id, repo_id, name, email)` — raw pairs from git history
- `authors(id, repo_id, display_name, display_email)`
- `identity_map(identity_id, author_id)` — default 1:1; merges only rewrite this
- `commits(repo_id, sha, author_identity_id, committer_ts, author_ts, message, parent_count, is_merge)` PK(repo_id, sha)
- `paths(id, repo_id, path)`; `dirs(repo_id, dir_path, parent_dir)` — for recursive directory rollups (WITH RECURSIVE)
- `commit_file_stats(repo_id, commit_sha, path_id, old_path_id NULL, lines_added, lines_removed, is_binary, is_rename)` — the fact table
- `file_current(repo_id, path_id, loc)` — HEAD snapshot (background phase)
- `file_ownership(path_id, identity_id, lines)` — blame results, keyed by identity so merges map through (lazy pipeline, only if final metrics need it)
- Indexes: `(repo_id, author_identity_id)`, `(repo_id, path_id)`, `(repo_id, committer_ts)`

## Subsystem: Ingestion (server/src/ingestion/)

- `POST /api/repos` — multipart zip upload OR JSON `{ url, name }`; creates repo row, enqueues job, returns id.
- Job phases (progress exposed via repo status):
  1. **Acquire**: zip → unzip with zip-slip guard into `data/repos/<id>/repo`; validate git repo (root has `.git/` dir, or root is bare: `HEAD` + `objects/` + `refs/`); reject `.git` gitfile pointers with a clear error. URL → `git clone --mirror` (deepest clone, all refs).
  2. **Extract**: stream `git log --all --numstat -M --date=iso-strict --format=<unit-separator record>`; parse commits + numstat rows (binary `-`, rename `old => new`); batched inserts in 10k-row transactions.
  3. **Snapshot**: `git ls-files` + LOC per file via streaming `git cat-file --batch`; build `dirs` table.
  4. **Mailmap**: read `.mailmap` (worktree file or `HEAD:.mailmap` blob), apply to `identity_map` creating canonical authors.
- `GET /api/repos` (list + status/progress), `DELETE /api/repos/:id` (rows + storage dir).
- Private URLs: passed to git verbatim (credential-in-URL or ambient SSH keys work); no secrets UI.
- No refresh/re-sync in v1 — re-import to update (schema supports future incremental fetch).

## Subsystem: Authors & Merging (server/src/authors/)

- `GET /api/repos/:id/authors` — canonical authors with their identities + commit counts.
- `POST /api/repos/:id/authors/merge` `{ authorIds[], displayName }` — repoint `identity_map` rows, drop emptied authors.
- `POST /api/repos/:id/authors/:id/unmerge` — split identities back to 1:1.
- Manual merging is the fallback when no mailmap exists; mailmap merging is the same mechanism applied at import time.

## Subsystem: Metrics Engine & API (server/src/metrics/)

- Shared `Filter` type (server + web): `{ repoIds?, authorIds?, pathPrefix?, fromTs?, toTs?, commitShas? }` — commitShas (manual commit list) takes precedence over time range.
- `FilterBuilder` compiles a filter into a WHERE clause on the fact join; single code path for all endpoints.
- Endpoints: `GET /api/metrics/files | dirs | repo | authors | commit-set` with filter query params.
  - files: `GROUP BY path_id`; dirs: `WITH RECURSIVE` over `dirs` to include descendants; authors: `GROUP BY author_id`; commit-set: metrics restricted to the selected commits.
- Provisional metric set (replaced by the user's final list when provided): commits, lines_added, lines_removed, churn, net_delta, distinct_authors / distinct_files, first/last activity.
- Merge commits: counted in commit counts, excluded from line churn (avoids double counting) — configurable flag.
- Blame-based ownership (likely in the final list): background `git blame --line-porcelain` pipeline writing `file_ownership` keyed by identity.

## Subsystem: Frontend (web/)

- Pages: **Repos** (list, import wizard with live progress, delete), **Dashboard** (repo-level metrics + activity timeline chart), **Files** (sortable table), **Directories** (tree picker + recursive rollup table), **Authors** (table + merge dialog), **Commits** (browser with multiselect → commit-set metrics panel).
- Global **FilterBar**: repository, authors (multi-select), path (tree picker), date range, selected-commits chip — drives every metrics page (zustand store for filter state).
- TanStack Table + Recharts; typed API client generated from shared types.

## Assumptions & Open Ambiguities

1. **Final metric definitions pending from user** — highest-priority open item; fact store + registry make it a late, low-risk addition.
2. "Author" is treated as a first-class dimension with its own metrics view, not a fifth category (spec lists four categories but demands per-author metrics).
3. Merge commits excluded from churn, included in commit counts (default, configurable).
4. Rename detection on (`-M`): a rename is one path touch, not delete+add churn; old path recorded.
5. Binary files: touch counted; excluded from line metrics.
6. Date filters use committer date by default (both committer and author dates stored).
7. Directory metrics are recursive (include all descendants).
8. Authors canonicalized per repo; cross-repo identity unification deferred.
9. No repo refresh in v1; re-import to update.
10. No auth, no multi-user (local tool, per user decision).

## Build Order

Rationale: the data foundation is metric-independent, so the pending metrics list blocks nothing; author model comes early because every metric slices by author.

- **M0 — Scaffolding**: workspaces, Express + TS + better-sqlite3 + migrations, Vite React TS shell, dev scripts, shared types.
- **M1 — Ingestion**: job queue, zip + URL sources, git wrappers, streaming extraction, snapshot + dirs build, repo CRUD + progress API.
- **M2 — Authors**: identity model, mailmap ingestion, manual merge/unmerge API.
- **M3 — Metrics engine**: filter builder, registry, file/dir/repo/author/commit-set aggregations + endpoints.
- **M4 — Dashboard**: import wizard, filter bar, all tables, commit browser + commit-set panel, author merge UI.
- **M5 — Final metrics & polish**: integrate the user's real metric list (incl. blame pipeline if needed), charts, hotspot/volatility views, large-repo performance pass, README.

## Test Plan

- Unit: extractor parser (against programmatically generated fixture repos), mailmap parser, filter builder, merge/unmerge invariants.
- Metric math: small hand-computed repo asserting exact numbers per dimension, including rename, binary, and merge-commit cases.
- API: supertest against a temp DB; import E2E: create fixture repo → zip → upload → assert extracted facts.
- Frontend: Vitest component smoke tests (filter bar → query params); one Playwright happy-path E2E if time permits.