# Repo Analysis Tool (RAT)

A local web dashboard that measures metrics of git repositories — per author,
per file, per directory, per repository, and over manually selected commit
sets. Repositories are imported from a zip archive (containing `.git`) or
cloned from a remote URL.

## Status

Scaffolding milestone (M0) complete. Repository ingestion (M1), author
merging (M2), the metrics engine (M3), and the dashboard (M4) are upcoming.

## Prerequisites

- Node.js >= 18.19 and npm
- git (used for history extraction and cloning)

## Development

```sh
npm install
npm run dev
```

- UI: http://localhost:5173
- API: http://127.0.0.1:3001/api/health

`npm run dev` starts both the API server (`node --watch`, port 3001) and the
Vite dev server (port 5173, proxying `/api` to the API server).

### Other scripts

- `npm test` — server test suite (Vitest + supertest)
- `npm run lint` — ESLint across all workspaces
- `npm run build` — production build of the web app

## Layout

- `server/` — Express API, SQLite storage (better-sqlite3), import pipeline
- `web/` — React dashboard (Vite, Tailwind CSS)
- `shared/` — constants and JSDoc type definitions shared by server and web
- `data/` — runtime storage, gitignored: `rat.sqlite` plus imported repos

### Configuration

Environment variables (all optional): `RAT_PORT` (default 3001),
`RAT_HOST` (default 127.0.0.1), `RAT_DATA_DIR` (default `<repo>/data`).

Note for native builds: `.npmrc` pins node-gyp's Python to
`/usr/bin/python3`; a distribution Python without the `gyp` package (e.g.
some Anaconda setups) breaks better-sqlite3 source builds.
