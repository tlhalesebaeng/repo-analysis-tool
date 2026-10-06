import { useState } from 'react';
import FilterBar from '../components/ui/FilterBar.jsx';
import { Bar, ErrorNote, NumTd, Spinner, StatCard, Table, Td, Th } from '../components/ui/widgets.jsx';
import { filterQuery, useFilter, useJson } from '../store.jsx';
import { fmtCompact, fmtDateTime, fmtDelta, fmtInt } from '../format.js';

const PAGE = 50;

/** Metrics for the manually selected commit set (manual H ⊆ H̄). */
function CommitSetPanel({ repoId, shas, onClear }) {
  const { data, error } = useJson(`/repos/${repoId}/metrics/commit-set?commitShas=${shas.join(',')}`, [shas.join(',')]);
  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-50 p-5 backdrop-blur">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-violet-700">Commit-set metrics — {fmtInt(shas.length)} selected</p>
        <button type="button" onClick={onClear} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700">
          Clear selection
        </button>
      </div>
      {error ? <ErrorNote error={error} /> : null}
      {data ? (
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard label="|H|" value={fmtInt(data.hSize)} tone="violet" />
          <StatCard label="l+" value={fmtInt(data.la)} tone="emerald" />
          <StatCard label="l−" value={fmtInt(data.lr)} tone="rose" />
          <StatCard label="δ growth" value={fmtDelta(data.delta)} tone="cyan" />
          <StatCard label="λ churn" value={fmtCompact(data.churn)} tone="amber" />
          <StatCard label="n modified" value={fmtInt(data.n)} sub={`η ${fmtInt(data.hSize) > 0 ? ((data.n / data.hSize) * 100).toFixed(0) : 0}%`} tone="violet" />
          {data.topAuthors.slice(0, 6).map((a) => (
            <div key={a.author_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="truncate text-slate-600">{a.display_name}</span>
              <span className="ml-3 flex items-center gap-2">
                <span className="tabular-nums text-slate-500">λ {fmtInt(a.churn)}</span>
                <Bar fraction={a.omega} className="bg-gradient-to-r from-cyan-500 to-sky-400" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Spinner label="Computing commit-set metrics…" />
      )}
    </div>
  );
}

/** Browser over stored commits (= H̄) with multi-select for manual commit sets. */
export default function CommitsPage() {
  const f = useFilter();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState([]);
  const { data, error, loading } = useJson(
    f.repoId ? `/repos/${f.repoId}/commits${filterQuery(f, { q: query, limit: PAGE, offset })}` : '',
    [f.repoId, f.fromTs, f.toTs, f.authorIds, query, offset],
  );

  const toggle = (sha) => setSelected((s) => (s.includes(sha) ? s.filter((x) => x !== sha) : [...s, sha]));
  const page = data ? Math.floor(offset / PAGE) + 1 : 0;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Commits</h2>
          <p className="mt-1 text-sm text-slate-500">
            Browser over the stored non-merge history{data ? ` — ${fmtInt(data.total)} commits` : ''}; select rows to build a manual commit set.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setOffset(0);
            setQuery(q);
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search commit messages…"
            className="w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20"
          />
          <button type="submit" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200">
            Search
          </button>
        </form>
      </div>
      <FilterBar />

      {selected.length > 0 ? <CommitSetPanel repoId={f.repoId} shas={selected} onClear={() => setSelected([])} /> : null}

      {loading && !data ? <Spinner label="Loading commits…" /> : null}
      <ErrorNote error={error} />
      {data ? (
        <>
          <Table>
            <thead>
              <tr>
                <Th className="w-8" />
                <Th className="text-left">Commit</Th>
                <Th className="text-left">Message</Th>
                <Th className="text-left">Author</Th>
                <Th className="text-right">Date</Th>
                <Th className="text-right">l+</Th>
                <Th className="text-right">l−</Th>
                <Th className="text-right">λ</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.sha} className={`transition hover:bg-slate-50 ${selected.includes(c.sha) ? 'bg-violet-500/10' : ''}`}>
                  <Td className="text-center">
                    <input type="checkbox" className="accent-violet-500" checked={selected.includes(c.sha)} onChange={() => toggle(c.sha)} />
                  </Td>
                  <Td className="font-mono text-[12px] text-violet-600">{c.short_sha}</Td>
                  <Td className="max-w-96 truncate text-slate-600">{c.message}</Td>
                  <Td className="max-w-40 truncate text-slate-500">{c.author}</Td>
                  <NumTd className="whitespace-nowrap text-slate-500">{fmtDateTime(c.committer_ts)}</NumTd>
                  <NumTd className="text-emerald-600">{fmtInt(c.la)}</NumTd>
                  <NumTd className="text-rose-600">{fmtInt(c.lr)}</NumTd>
                  <NumTd className="font-semibold text-slate-900">{fmtInt(c.la + c.lr)}</NumTd>
                </tr>
              ))}
              {data.rows.length === 0 ? (
                <tr>
                  <Td colSpan={8} className="py-10 text-center text-slate-500">
                    No commits match.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </Table>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {page} / {pages}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                type="button"
                disabled={offset + PAGE >= data.total}
                onClick={() => setOffset(offset + PAGE)}
                className="rounded-lg bg-slate-100 px-3 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      ) : null}
      {!f.repoId ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-16 text-center">
          <p className="text-3xl">⎇</p>
          <p className="mt-2 font-semibold text-slate-600">Select a repository</p>
        </div>
      ) : null}
    </div>
  );
}
