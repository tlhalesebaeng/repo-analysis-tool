-- 001: initial RAT schema.
--
-- Star schema for the metric-agnostic fact store: commits and per-commit file
-- change records are persisted as raw facts; every metric is computed later as
-- a query-time aggregation (see plan, "Key Design Decisions").
--
-- Conventions:
--   * Timestamps are INTEGER unix seconds.
--   * Paths are POSIX-style repo-relative strings with no leading slash.
--   * dir_path is '' for the repository root, 'src', 'src/components', ...

CREATE TABLE repositories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('zip', 'url')),
  source_ref TEXT,                  -- original zip filename or remote URL
  storage_path TEXT NOT NULL,       -- absolute path under data/repos/<id>/
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'importing', 'ready', 'failed')),
  progress_pct INTEGER NOT NULL DEFAULT 0,
  phase TEXT,                       -- current IMPORT_PHASES value while importing
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Raw (name, email) pairs as they appear in git history.
CREATE TABLE identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  UNIQUE (repo_id, name, email)
);

-- Canonical authors after merging (via mailmap or manually).
CREATE TABLE authors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  display_email TEXT
);
CREATE INDEX idx_authors_repo ON authors(repo_id);

-- Maps each raw identity to exactly one canonical author. Merging authors
-- only rewrites rows here; unmerging splits them back 1:1.
CREATE TABLE identity_map (
  identity_id INTEGER PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE
);
CREATE INDEX idx_identity_map_author ON identity_map(author_id);

CREATE TABLE commits (
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  author_identity_id INTEGER NOT NULL REFERENCES identities(id),
  committer_ts INTEGER NOT NULL,
  author_ts INTEGER NOT NULL,
  message TEXT NOT NULL,
  parent_count INTEGER NOT NULL DEFAULT 0,
  is_merge INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, sha)
);
CREATE INDEX idx_commits_repo_identity ON commits(repo_id, author_identity_id);
CREATE INDEX idx_commits_repo_committer_ts ON commits(repo_id, committer_ts);

-- Distinct file paths seen anywhere in history (current and deleted files).
CREATE TABLE paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  UNIQUE (repo_id, path)
);

-- Distinct directories derived from paths; parent_dir is NULL for the root ('').
CREATE TABLE dirs (
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  dir_path TEXT NOT NULL,
  parent_dir TEXT,
  PRIMARY KEY (repo_id, dir_path)
);

-- The fact table: one row per (commit, new path) numstat record.
CREATE TABLE commit_file_stats (
  repo_id INTEGER NOT NULL,
  commit_sha TEXT NOT NULL,
  path_id INTEGER NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  old_path_id INTEGER REFERENCES paths(id),  -- set when the change is a rename/copy
  lines_added INTEGER,                       -- NULL for binary files
  lines_removed INTEGER,                     -- NULL for binary files
  is_binary INTEGER NOT NULL DEFAULT 0,
  is_rename INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (repo_id, commit_sha, path_id),
  FOREIGN KEY (repo_id, commit_sha) REFERENCES commits(repo_id, sha) ON DELETE CASCADE
);
CREATE INDEX idx_cfs_repo_path ON commit_file_stats(repo_id, path_id);

-- HEAD snapshot: lines of code per tracked file.
CREATE TABLE file_current (
  repo_id INTEGER NOT NULL,
  path_id INTEGER NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
  loc INTEGER,
  PRIMARY KEY (repo_id, path_id)
);

-- Blame output (built lazily only if the final metric set needs ownership).
-- Keyed by identity so author merges map through without recomputation.
CREATE TABLE file_ownership (
  path_id INTEGER PRIMARY KEY REFERENCES paths(id) ON DELETE CASCADE,
  identity_id INTEGER NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  lines INTEGER NOT NULL
);
CREATE INDEX idx_file_ownership_identity ON file_ownership(identity_id);
