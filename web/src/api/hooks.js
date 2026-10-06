import { useEffect, useState } from 'react';
import { api } from './client.js';

/**
 * Minimal data-fetching hook: fetches `path` whenever it changes and exposes
 * { loading, data, error }. While refetching, the previous data or error stays
 * visible until the new request settles (no synchronous state reset, per
 * react-hooks/set-state-in-effect). Replaced by a richer data layer in M4.
 *
 * @param {string} path API path relative to /api, e.g. '/health'.
 */
export function useApi(path) {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    api
      .get(path)
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
