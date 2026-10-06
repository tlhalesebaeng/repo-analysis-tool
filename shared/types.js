/**
 * Shared type definitions (JSDoc). Import nothing from this module; it exists
 * so that editors and the server can reference the same shapes via `@typedef`
 * imports, e.g. `@param {import('@rat/shared/types').Filter} filter`.
 */

/**
 * @typedef {'zip' | 'url'} RepoSourceType
 */

/**
 * @typedef {'pending' | 'importing' | 'ready' | 'failed'} RepoStatus
 */

/**
 * @typedef {object} RepoSummary
 * @property {number} id
 * @property {string} name
 * @property {RepoSourceType} source_type
 * @property {string | null} source_ref        Original zip filename or remote URL.
 * @property {string} reference                 Reference commit (branch, tag, or sha) metrics are computed from.
 * @property {RepoStatus} status
 * @property {number} progress_pct             0-100 while importing.
 * @property {string | null} phase             Current import phase (IMPORT_PHASES).
 * @property {string | null} error             Failure message when status = 'failed'.
 * @property {string} created_at
 */

/**
 * Dashboard filter applied to every metrics query.
 *
 * @typedef {object} Filter
 * @property {number[]} [repoIds]              Restrict to these repositories.
 * @property {number[]} [authorIds]            Restrict to these canonical authors (post-merge).
 * @property {string} [pathPrefix]             Directory-scoped filter; matches the directory and all descendants.
 * @property {number} [fromTs]                 Unix seconds, inclusive (committer date by default).
 * @property {number} [toTs]                   Unix seconds, inclusive (committer date by default).
 * @property {string[]} [commitShas]           Manually selected commits; when set, overrides fromTs/toTs.
 */

/**
 * @typedef {object} AuthorSummary
 * @property {number} id
 * @property {string} display_name
 * @property {string | null} display_email
 * @property {number} commit_count
 */

export {};
