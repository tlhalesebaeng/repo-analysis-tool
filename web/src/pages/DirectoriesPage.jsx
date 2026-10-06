import FilterBar from '../components/ui/FilterBar.jsx';
import { ErrorNote, MetricCells, NumTd, Spinner, Table, Td, Th } from '../components/ui/widgets.jsx';
import { filterQuery, useFilter, useJson } from '../store.jsx';
import { fmtInt } from '../format.js';

/** Directory metrics (recursive subtree sums) as an indented tree. */
export default function DirectoriesPage() {
  const f = useFilter();
  const { data, error, loading } = useJson(
    f.repoId ? `/repos/${f.repoId}/metrics/dirs${filterQuery(f)}` : '',
    [f.repoId, f.fromTs, f.toTs, f.authorIds, f.pathPrefix],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Directories</h2>
        <p className="mt-1 text-sm text-slate-500">
          Recursive subtree sums per directory — the root row is the repository itself
          {data ? `, |H| = ${fmtInt(data.hSize)}` : ''}.
        </p>
      </div>
      <FilterBar showPrefix />
      {loading && !data ? <Spinner label="Rolling up directory subtrees…" /> : null}
      <ErrorNote error={error} />
      {data ? (
        <Table>
          <thead>
            <tr>
              <Th className="text-left">Directory</Th>
              <Th className="text-right">l+</Th>
              <Th className="text-right">l−</Th>
              <Th className="text-right">δ</Th>
              <Th className="text-right">λ churn</Th>
              <Th className="text-right">n</Th>
              <Th className="text-right">η freq</Th>
              <Th className="text-right">ρ rate</Th>
              <Th className="text-right">files</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((d) => {
              const isRoot = d.dirPath === '';
              return (
                <tr key={d.dirPath} className={`transition hover:bg-slate-50 ${isRoot ? 'bg-violet-500/10' : ''}`}>
                  <Td className="max-w-96 font-mono text-[13px]">
                    <span style={{ paddingLeft: (d.depth - (isRoot ? 0 : 1)) * 16 }} className={isRoot ? 'font-semibold text-violet-700' : 'text-slate-600'}>
                      {isRoot ? '⌂ repository root' : `${d.dirPath.split('/').pop()}/`}
                    </span>
                  </Td>
                  <MetricCells row={d} />
                  <NumTd className="text-slate-500">{fmtInt(d.files)}</NumTd>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}
