import { Fragment, useState } from 'react';
import FilterBar from '../components/ui/FilterBar.jsx';
import { Bar, ErrorNote, MetricCells, MetricHeaders, NumTd, Spinner, Table, Td, Th } from '../components/ui/widgets.jsx';
import { filterQuery, useFilter, useJson } from '../store.jsx';
import { fmtDate, fmtInt } from '../format.js';

/** Author breakdown + recent per-commit primitives for one expanded file. */
function FileDrilldown({ repoId, file }) {
  const { data: commits, error } = useJson(
    `/repos/${repoId}/commits?pathId=${file.path_id}&limit=25`,
    [repoId, file.path_id],
  );
  return (
    <tr className="bg-slate-950/40">
      <Td colSpan={9} className="px-6 py-4">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Author breakdown — churn λₐ · ownership ωₐ</p>
            <div className="space-y-1.5">
              {file.authors.map((a) => (
                <div key={a.authorId} className="flex items-center gap-3 text-sm">
                  <span className="w-44 truncate text-slate-300">{a.author}</span>
                  <span className="w-20 text-right tabular-nums text-slate-400">λ {fmtInt(a.churn)}</span>
                  <span className="flex-1">
                    <Bar fraction={a.omega} className="bg-gradient-to-r from-cyan-500 to-sky-400" />
                  </span>
                </div>
              ))}
              {file.authors.length === 0 ? <p className="text-sm text-slate-600">No measured changes.</p> : null}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Recent commits touching this file</p>
            <div className="max-h-56 space-y-1 overflow-auto pr-1">
              {(commits?.rows ?? []).map((c) => (
                <div key={c.sha} className="flex items-baseline gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                  <span className="font-mono text-violet-300">{c.short_sha}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-400">{c.message}</span>
                  {c.is_binary ? (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">BIN</span>
                  ) : (
                    <span className="tabular-nums text-slate-500">
                      <span className="text-emerald-400">+{c.la ?? 0}</span> <span className="text-rose-400">−{c.lr ?? 0}</span>
                    </span>
                  )}
                  {c.is_rename ? <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[10px] text-fuchsia-300">REN</span> : null}
                  <span className="whitespace-nowrap text-slate-600">{fmtDate(c.committer_ts)}</span>
                </div>
              ))}
              {commits && commits.rows.length === 0 ? <p className="text-sm text-slate-600">No commits in range.</p> : null}
              {error ? <p className="text-xs text-rose-400">{error}</p> : null}
            </div>
          </div>
        </div>
      </Td>
    </tr>
  );
}

/** Commit-set metrics per file with drill-down (category 1 primitives). */
export default function FilesPage() {
  const f = useFilter();
  const [sortBy, setSortBy] = useState('churn');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);
  const { data, error, loading } = useJson(
    f.repoId ? `/repos/${f.repoId}/metrics/files${filterQuery(f, { sortBy, sortDir, limit: 500 })}` : '',
    [f.repoId, f.fromTs, f.toTs, f.authorIds, f.pathPrefix, sortBy, sortDir],
  );

  const onSort = (key) => {
    if (key === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir(key === 'path' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Files</h2>
          <p className="mt-1 text-sm text-slate-400">
            Commit-set metrics per file{data ? ` — ${fmtInt(data.total)} paths with recorded changes, |H| = ${fmtInt(data.hSize)}` : ''}
          </p>
        </div>
      </div>
      <FilterBar showPrefix />
      {loading && !data ? <Spinner label="Aggregating file metrics…" /> : null}
      <ErrorNote error={error} />
      {data ? (
        <Table>
          <thead>
            <tr>
              <Th className="w-8" />
              <MetricHeaders sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
              <Th className="text-right">LOC</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <Fragment key={r.path_id}>
                <tr
                  className="cursor-pointer transition hover:bg-white/[0.03]"
                  onClick={() => setExpanded(expanded === r.path_id ? null : r.path_id)}
                >
                  <Td className="text-center text-slate-500">{expanded === r.path_id ? '▾' : '▸'}</Td>
                  <Td className="max-w-96 truncate font-mono text-[13px] text-slate-200">{r.path}</Td>
                  <MetricCells row={r} />
                  <NumTd className="text-slate-400">{r.loc ?? '—'}</NumTd>
                </tr>
                {expanded === r.path_id ? <FileDrilldown repoId={f.repoId} file={r} /> : null}
              </Fragment>
            ))}
            {data.rows.length === 0 ? (
              <tr>
                <Td colSpan={10} className="py-10 text-center text-slate-500">
                  No files match the current filter.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}
