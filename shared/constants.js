/** Base path for all API routes (shared by the server and the web client). */
export const API_BASE = '/api';

/** Lifecycle states for a repository import. */
export const REPO_STATUSES = ['pending', 'importing', 'ready', 'failed'];

/** Ordered phases of an import job, exposed as progress to the UI. */
export const IMPORT_PHASES = ['queued', 'acquire', 'extract', 'snapshot', 'mailmap', 'done'];

/** Metric result categories (per the product spec). */
export const METRIC_CATEGORIES = ['file', 'directory', 'repository', 'commitSet'];
