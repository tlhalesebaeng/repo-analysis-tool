import { useEffect, useRef, useState } from 'react';
import { useFilter, useJson } from '../../store.jsx';
import { localToTs, tsToLocal } from '../../format.js';

const inputCls =
  'rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20';

/** Author multi-select popover. */
function AuthorPicker({ authors, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex min-w-44 items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">
          {selected.length === 0
            ? 'All authors'
            : selected.length === 1
              ? authors.find((a) => a.id === selected[0])?.display_name
              : `${selected.length} authors`}
        </span>
        <span className="text-slate-500">▾</span>
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 max-h-72 w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-300/60">
          {authors.map((a) => (
            <label
              key={a.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              <input
                type="checkbox"
                className="accent-violet-500"
                checked={selected.includes(a.id)}
                onChange={() =>
                  onChange(selected.includes(a.id) ? selected.filter((x) => x !== a.id) : [...selected, a.id])
                }
              />
              <span className="truncate">{a.display_name}</span>
              <span className="ml-auto text-xs text-slate-400">{a.commit_count}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Global filter bar: repository, author restriction, time range (toTs is
 * EXCLUSIVE per the metric spec), and an optional path prefix. Mounted on
 * every metric page; changes re-trigger each page's metric queries.
 */
export default function FilterBar({ showPrefix = false }) {
  const f = useFilter();
  const { data: repos } = useJson('/repos');
  const { data: authors } = useJson(f.repoId ? `/repos/${f.repoId}/authors` : '', [f.repoId]);
  const ready = (repos ?? []).filter((r) => r.status === 'ready');

  return (
    <div className="relative z-30 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 backdrop-blur">
      <span className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Filter</span>
      <select
        value={f.repoId ?? ''}
        onChange={(e) => f.setRepoId(Number(e.target.value) || null)}
        className={inputCls}
      >
        <option value="">Select repository…</option>
        {ready.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <AuthorPicker authors={authors ?? []} selected={f.authorIds} onChange={f.setAuthorIds} />
      <div className="flex items-center gap-1.5">
        <input
          type="datetime-local"
          className={inputCls}
          value={tsToLocal(f.fromTs)}
          onChange={(e) => f.setFromTs(localToTs(e.target.value))}
          title="From (inclusive)"
        />
        <span className="text-xs text-slate-400">→</span>
        <input
          type="datetime-local"
          className={inputCls}
          value={tsToLocal(f.toTs)}
          onChange={(e) => f.setToTs(localToTs(e.target.value))}
          title="To (EXCLUSIVE)"
        />
      </div>
      {showPrefix ? (
        <input
          type="text"
          placeholder="Path prefix (e.g. src/)"
          className={`${inputCls} w-48`}
          defaultValue={f.pathPrefix}
          onBlur={(e) => f.setPathPrefix(e.target.value.trim().replace(/\/+$/, ''))}
          onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
        />
      ) : null}
      {(f.fromTs !== null || f.toTs !== null || f.authorIds.length > 0 || f.pathPrefix) && (
        <button
          type="button"
          onClick={() => {
            f.setFromTs(null);
            f.setToTs(null);
            f.setAuthorIds([]);
            f.setPathPrefix('');
          }}
          className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          Reset
        </button>
      )}
      <span className="ml-auto rounded-lg bg-slate-100 px-2 py-1 text-[11px] text-slate-500">
        to <span className="text-slate-600">exclusive</span> · from <span className="text-slate-600">inclusive</span>
      </span>
    </div>
  );
}
