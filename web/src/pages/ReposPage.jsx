import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '@rat/shared/constants';
import { useFilter, useJson } from '../store.jsx';
import { fmtCompact, fmtInt } from '../format.js';
import { ErrorNote, Spinner } from '../components/ui/widgets.jsx';

const inputCls =
  'w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20';
const cardCls = 'rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur';

function ImportCard({ onDone }) {
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      let res;
      if (mode === 'url') {
        res = await fetch(`${API_BASE}/repos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, name: name || undefined, reference: reference || undefined }),
        });
      } else {
        const body = new FormData();
        body.append('file', file);
        if (name) body.append('name', name);
        if (reference) body.append('reference', reference);
        res = await fetch(`${API_BASE}/repos`, { method: 'POST', body });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      setUrl('');
      setName('');
      setReference('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onDone(data);
    } catch (err) {
      setError(String(err.message ?? err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={cardCls}>
      <div className="mb-4 flex gap-1 rounded-xl bg-white/5 p-1">
        {['url', 'zip'].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition ${
              mode === m ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {m === 'url' ? 'Clone URL' : 'Zip upload'}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {mode === 'url' ? (
          <input className={inputCls} placeholder="https://github.com/DaveGamble/cJSON.git" value={url} onChange={(e) => setUrl(e.target.value)} required />
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-slate-950/40 px-4 py-8 text-center transition hover:border-violet-500/50">
            <span className="text-2xl">📦</span>
            <span className="text-sm text-slate-300">{file ? file.name : 'Drop or choose a repository .zip'}</span>
            <span className="text-xs text-slate-600">a zip containing a .git directory (or a bare repo layout)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required={mode === 'zip'}
            />
          </label>
        )}
        <div className="flex gap-3">
          <input className={inputCls} placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={`${inputCls} w-40`} placeholder="Ref (HEAD)" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <ErrorNote error={error} />
        <button
          type="submit"
          disabled={busy || (mode === 'url' ? !url : !file)}
          className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Starting import…' : 'Import repository'}
        </button>
      </div>
    </form>
  );
}

const statusTone = {
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  importing: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

/** Import wizard + repository cards with live progress polling. */
export default function ReposPage() {
  const { setRepoId } = useFilter();
  const { data: repos, error, loading, reload } = useJson('/repos');
  const anyImporting = (repos ?? []).some((r) => r.status === 'importing' || r.status === 'pending');

  useEffect(() => {
    if (!anyImporting) return undefined;
    const t = setInterval(reload, 1500);
    return () => clearInterval(t);
  }, [anyImporting, reload]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Repositories</h2>
        <p className="mt-1 text-sm text-slate-400">Import a git repository from a URL or a zip archive, then explore its metrics.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <ImportCard onDone={reload} />

        <div className="space-y-4">
          {loading && !repos ? <Spinner label="Loading repositories…" /> : null}
          <ErrorNote error={error} />
          <div className="grid gap-4 sm:grid-cols-2">
            {(repos ?? []).map((r) => (
              <div key={r.id} className="group relative rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur transition hover:border-violet-500/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{r.name}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {r.source_type === 'zip' ? 'zip upload' : r.source_ref} · ref {r.reference}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone[r.status] ?? statusTone.pending}`}>
                    {r.status}
                  </span>
                </div>

                {r.status === 'importing' || r.status === 'pending' ? (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
                      <span className="capitalize">{r.phase}</span>
                      <span>{r.progress_pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                        style={{ width: `${r.progress_pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-4 text-sm text-slate-400">
                    <span className="tabular-nums">
                      <b className="text-white">{fmtInt(r.commit_count)}</b> commits
                    </span>
                    <span className="tabular-nums">
                      <b className="text-white">{fmtCompact(r.path_count)}</b> paths
                    </span>
                  </div>
                )}

                {r.error ? <p className="mt-3 line-clamp-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-300">{r.error}</p> : null}

                <div className="mt-4 flex gap-2">
                  {r.status === 'ready' ? (
                    <button
                      type="button"
                      onClick={() => setRepoId(r.id)}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-violet-300 transition hover:bg-violet-500/20"
                    >
                      Select →
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`Delete repository "${r.name}" and all its data?`)) {
                        await fetch(`${API_BASE}/repos/${r.id}`, { method: 'DELETE' });
                        reload();
                      }
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          {repos && repos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-10 text-center text-slate-500">
              No repositories yet — import one to get started.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
