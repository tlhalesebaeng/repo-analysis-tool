import { useState } from 'react';
import FilterBar from '../components/ui/FilterBar.jsx';
import { AreaChart, Bar, ErrorNote, MetricHeaders, MetricCells, NumTd, Spinner, StatCard, Table, Td, Th } from '../components/ui/widgets.jsx';
import { filterQuery, useFilter, useJson } from '../store.jsx';
import { fmtCompact, fmtDelta, fmtInt } from '../format.js';

/** Repository (root) metrics: KPI cards, monthly timeline, author table. */
export default function DashboardPage() {
  const f = useFilter();
  const { data: s, error, loading } = useJson(
    f.repoId ? `/repos/${f.repoId}/metrics/summary${filterQuery(f)}` : '',
    [f.repoId, f.fromTs, f.toTs, f.authorIds],
  );
  const [metric, setMetric] = useState('churn');

  if (!f.repoId) {
    return (
      <div className="space-y-6">
        <FilterBar />
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-16 text-center">
          <p className="text-3xl">📊</p>
          <p className="mt-2 font-semibold text-slate-300">Select a repository</p>
          <p className="text-sm text-slate-500">Pick a repository in the filter bar to see its dashboard.</p>
        </div>
      </div>
    );
  }

  const series = (s?.timeline ?? []).map((t) => ({ label: t.month.slice(2), value: metric === 'churn' ? t.churn : metric === 'commits' ? t.commits : t.growth }));

  return (
    <div className="space-y-6">
      <FilterBar />
      {loading && !s ? <Spinner label="Computing metrics…" /> : null}
      <ErrorNote error={error} />
      {s ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard label="Commits |H|" value={fmtInt(s.hSize)} icon="⎇" tone="violet" />
            <StatCard label="Churn λ" value={fmtCompact(s.churn)} sub={`ρ ${fmtCompact(s.rho)}/commit`} icon="⚡" tone="cyan" />
            <StatCard label="Growth δ" value={fmtDelta(s.delta)} sub={`${fmtInt(s.la)}+ · ${fmtInt(s.lr)}−`} icon="📈" tone="emerald" />
            <StatCard label="Authors" value={fmtInt(s.authorCount)} icon="👥" tone="amber" />
            <StatCard label="Files touched" value={fmtInt(s.filesTouched)} icon="🗂️" tone="rose" />
            <StatCard label="Current LOC" value={fmtCompact(s.loc)} sub="HEAD snapshot" icon="ℹ" tone="violet" />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-white">History</h3>
              <div className="flex gap-1 rounded-xl bg-white/5 p-1 text-xs font-semibold">
                {[
                  ['churn', 'Churn λ'],
                  ['commits', 'Commits'],
                  ['growth', 'Growth δ'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMetric(key)}
                    className={`rounded-lg px-3 py-1 transition ${metric === key ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <AreaChart data={series} id="dash" />
          </div>

          <div>
            <h3 className="mb-2 font-semibold text-white">Top authors</h3>
            <Table>
              <thead>
                <tr>
                  <MetricHeaders firstLabel="Author" />
                  <Th className="text-right">commits</Th>
                  <Th className="text-right">ownership ω</Th>
                </tr>
              </thead>
              <tbody>
                {s.topAuthors.map((a) => (
                  <tr key={a.author_id} className="transition hover:bg-white/[0.03]">
                    <Td className="max-w-64 truncate font-medium text-slate-200">{a.display_name}</Td>
                    <MetricCells row={a} />
                    <NumTd className="text-slate-300">{fmtInt(a.commits)}</NumTd>
                    <NumTd>
                      <Bar fraction={a.omega} className="bg-gradient-to-r from-cyan-500 to-sky-400" />
                    </NumTd>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      ) : null}
    </div>
  );
}
