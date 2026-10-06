import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api/client.js';

/**
 * Global metric filter (spec semantics): repo + commit-set restrictions
 * (authors, fromTs inclusive, toTs EXCLUSIVE) plus the display-only
 * pathPrefix. The selected repo persists across reloads.
 */
const FilterCtx = createContext(null);

/** Fetches JSON from the API; refetches whenever the path changes (callers
 * encode all filter state into the path, so it is the sole dependency). */
export function useJson(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!path) {
      Promise.resolve().then(() => {
        if (alive) setState({ data: null, error: null, loading: false });
      });
    } else {
      api
        .get(path)
        .then((data) => {
          if (alive) setState({ data, error: null, loading: false });
        })
        .catch((err) => {
          if (alive) setState({ data: null, error: String(err.message ?? err), loading: false });
        });
    }
    return () => {
      alive = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function FilterProvider({ children }) {
  const [repoId, setRepoId] = useState(() => {
    const n = Number(localStorage.getItem('rat.repoId'));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  const [authorIds, setAuthorIds] = useState([]);
  const [fromTs, setFromTs] = useState(null);
  const [toTs, setToTs] = useState(null);
  const [pathPrefix, setPathPrefix] = useState('');

  useEffect(() => {
    localStorage.setItem('rat.repoId', repoId ?? '');
  }, [repoId]);

  const switchRepo = useCallback((id) => {
    setRepoId(id);
    setAuthorIds([]);
    setPathPrefix('');
  }, []);

  const value = useMemo(
    () => ({
      repoId,
      setRepoId: switchRepo,
      authorIds,
      setAuthorIds,
      fromTs,
      setFromTs,
      toTs,
      setToTs,
      pathPrefix,
      setPathPrefix,
    }),
    [repoId, switchRepo, authorIds, fromTs, toTs, pathPrefix],
  );
  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export function useFilter() {
  return useContext(FilterCtx);
}

/** Builds the query string for metric endpoints from the filter + extras. */
export function filterQuery(f, extra = {}) {
  const params = new URLSearchParams();
  if (f.fromTs != null) params.set('fromTs', f.fromTs);
  if (f.toTs != null) params.set('toTs', f.toTs);
  if (f.authorIds && f.authorIds.length > 0) params.set('authorIds', f.authorIds.join(','));
  if (f.pathPrefix) params.set('pathPrefix', f.pathPrefix);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== null && v !== undefined && v !== '') params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}
