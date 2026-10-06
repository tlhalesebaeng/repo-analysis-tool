import { useState } from 'react';
import { api } from '../api/client.js';
import FilterBar from '../components/ui/FilterBar.jsx';
import { Bar, ErrorNote, MetricCells, MetricHeaders, NumTd, Spinner, Table, Td, Th } from '../components/ui/widgets.jsx';
import { filterQuery, useFilter, useJson } from '../store.jsx';
import { fmtInt } from '../format.js';

const inputCls =
  'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20';

/** Inline merge dialog shown when authors are selected. */
function MergeDialog({ repoId, selected, names, onDone, onCancel }) {
  const [displayName, setDisplayName] = useState('');
  const [displayEmail, setDisplayEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const merge = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/repos/${repoId}/authors/merge`, {
        authorIds: selected,
        displayName: displayName || undefined,
        displayEmail: displayEmail || undefined,
      });
      onDone();
    } catch (err) {
      setError(String(err.message ?? err));
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
      <p className="mb-3 font-semibold text-violet-200">
        Merge {selected.length} authors <span className="font-normal text-slate-400">({names.join(', ')})</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <input className={`${inputCls} flex-1`} placeholder="Display name (default: first author)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <input className={`${inputCls} flex-1`} placeholder="Display email" value={displayEmail} onChange={(e) => setDisplayEmail(e.target.value)} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={merge}
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:brightness-110 disabled:opacity-40"
          >
            {busy ? 'Merging…' : 'Merge'}
          </button>
          <button type="button" onClick={onCancel} className="rounded-xl px-3 py-2 text-sm text-slate-400 hover:text-slate-200">
            Cancel
          </button>
        </div>
      </div>
      <ErrorNote error={error} />
      <p className="mt-2 text-xs text-slate-500">
        Identities are re-pointed through identity_map; every metric updates instantly — no re-import needed.
      </p>
    </div>
  );
}

/** Author metrics on the root object + identity merging (M2 surface). */
export default function AuthorsPage() {
  const f = useFilter();
  const [selected, setSelected] = useState([]);
  const { data, error, loading, reload } = useJson(
    f.repoId ? `/repos/${f.repoId}/metrics/authors${filterQuery(f)}` : '',
    [f.repoId, f.fromTs, f.toTs, f.authorIds],
  );
  const { data: rawAuthors, reload: reloadRaw } = useJson(f.repoId ? `/repos/${f.repoId}/authors` : '', [f.repoId]);
  const nameById = new Map((rawAuthors ?? []).map((a) => [a.id, a.display_name]));

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const unmerge = async (authorId) => {
    await api.post(`/repos/${f.repoId}/authors/unmerge`, { authorId });
    reload();
    reloadRaw();
    setSelected([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Authors</h2>
        <p className="mt-1 text-sm text-slate-400">
          Author metrics over the repository (root object){data ? ` — |H| = ${fmtInt(data.hSize)}` : ''}, plus identity merging.
        </p>
      </div>
      <FilterBar />

      {selected.length >= 2 ? (
        <MergeDialog
          repoId={f.repoId}
          selected={selected}
          names={selected.map((id) => nameById.get(id) ?? id)}
          onDone={() => {
            setSelected([]);
            reload();
            reloadRaw();
          }}
          onCancel={() => setSelected([])}
        />
      ) : null}

      {loading && !data ? <Spinner label="Computing author metrics…" /> : null}
      <ErrorNote error={error} />
      {data ? (
        <Table>
          <thead>
            <tr>
              <Th className="w-8" />
              <MetricHeaders firstLabel="Author" />
              <Th className="text-right">commits</Th>
              <Th className="text-right">identities</Th>
              <Th className="text-right">ownership ω</Th>
              <Th className="text-right">merge</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((a) => {
              const raw = (rawAuthors ?? []).find((r) => r.id === a.author_id);
              return (
                <tr key={a.author_id} className={`transition hover:bg-white/[0.03] ${selected.includes(a.author_id) ? 'bg-violet-500/10' : ''}`}>
                  <Td className="text-center">
                    <input type="checkbox" className="accent-violet-500" checked={selected.includes(a.author_id)} onChange={() => toggle(a.author_id)} />
                  </Td>
                  <Td className="max-w-64">
                    <p className="truncate font-medium text-slate-200">{a.display_name}</p>
                    {raw && raw.identities.length > 1 ? (
                      <p className="truncate text-[11px] text-slate-600">{raw.identities.map((i) => `${i.name} <${i.email}>`).join(' · ')}</p>
                    ) : null}
                  </Td>
                  <MetricCells row={a} />
                  <NumTd className="text-slate-300">{fmtInt(a.commits)}</NumTd>
                  <NumTd className="text-slate-400">{raw?.identities.length ?? 1}</NumTd>
                  <NumTd>
                    <Bar fraction={a.omega} className="bg-gradient-to-r from-cyan-500 to-sky-400" />
                  </NumTd>
                  <Td>
                    {raw && raw.identities.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => unmerge(a.author_id)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-cyan-500/10 hover:text-cyan-300"
                      >
                        Split
                      </button>
                    ) : (
                      <span className="text-xs text-slate-700">—</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
      {!f.repoId ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-16 text-center">
          <p className="text-3xl">👥</p>
          <p className="mt-2 font-semibold text-slate-300">Select a repository</p>
        </div>
      ) : null}
    </div>
  );
}
