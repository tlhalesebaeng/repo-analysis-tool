import { fmtCompact, fmtInt, fmtPct } from '../../format.js';

/** KPI card with a gradient icon, label, and value. */
export function StatCard({ label, value, sub, icon, tone = 'violet' }) {
  const tones = {
    violet: 'from-violet-500/10 to-fuchsia-500/5 text-violet-600',
    cyan: 'from-cyan-500/20 to-sky-500/5 text-cyan-600',
    emerald: 'from-emerald-500/20 to-teal-500/5 text-emerald-600',
    amber: 'from-amber-500/20 to-orange-500/5 text-amber-600',
    rose: 'from-rose-500/20 to-pink-500/5 text-rose-600',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 backdrop-blur transition hover:border-white/20">
      <div className={`absolute inset-x-0 -top-16 h-24 bg-gradient-to-b ${tones[tone]} blur-2xl opacity-60`} />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
        </div>
        {icon ? <span className={`rounded-xl bg-gradient-to-br ${tones[tone]} p-2 text-lg`}>{icon}</span> : null}
      </div>
    </div>
  );
}

/** Shared table chrome: dark glass panel, sticky header, zebra hover. */
export function Table({ children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-white backdrop-blur ${className}`}>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className = '', onClick, active }) {
  return (
    <th
      onClick={onClick}
      className={`sticky top-0 z-10 whitespace-nowrap bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 backdrop-blur ${
        onClick ? 'cursor-pointer select-none hover:text-slate-700' : ''
      } ${active ? 'text-violet-600' : ''} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = '', colSpan }) {
  return (
    <td colSpan={colSpan} className={`border-t border-slate-100 px-4 py-2.5 ${className}`}>
      {children}
    </td>
  );
}

export function NumTd({ children, className = '' }) {
  return <Td className={`whitespace-nowrap text-right tabular-nums ${className}`}>{children}</Td>;
}

/** Inline horizontal fraction bar (for η, ω). */
export function Bar({ fraction, className = 'bg-gradient-to-r from-violet-500 to-fuchsia-500' }) {
  const pct = Math.max(0, Math.min(1, fraction ?? 0)) * 100;
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="w-14 text-right tabular-nums text-slate-600">{fmtPct(fraction)}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <span className={`block h-full rounded-full ${className}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">{String(error)}</div>
  );
}

export function EmptyState({ title, hint, icon = '🗂️' }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center">
      <span className="text-3xl">{icon}</span>
      <p className="font-semibold text-slate-600">{title}</p>
      {hint ? <p className="max-w-md text-sm text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Metric column bodies shared by the Files / Directories / Authors tables. */
export const MetricCells = ({ row }) => (
  <>
    <NumTd className="text-emerald-600">{fmtInt(row.la)}</NumTd>
    <NumTd className="text-rose-600">{fmtInt(row.lr)}</NumTd>
    <NumTd className={row.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
      {row.delta > 0 ? '+' : ''}
      {fmtInt(row.delta)}
    </NumTd>
    <NumTd className="font-semibold text-slate-900">{fmtCompact(row.churn)}</NumTd>
    <NumTd>{fmtInt(row.n)}</NumTd>
    <NumTd>
      <Bar fraction={row.eta} />
    </NumTd>
    <NumTd className="text-slate-600">{fmtCompact(row.rho)}</NumTd>
  </>
);

export const MetricHeaders = ({ sortBy, sortDir, onSort, firstLabel = 'Path' }) => {
  const arrow = (key) => (sortBy === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');
  const click = (key) => onSort && onSort(key);
  return (
    <>
      <Th className="text-left">{firstLabel}</Th>
      <Th onClick={() => click('la')} active={sortBy === 'la'} className="text-right">
        l+{arrow('la')}
      </Th>
      <Th onClick={() => click('lr')} active={sortBy === 'lr'} className="text-right">
        l−{arrow('lr')}
      </Th>
      <Th onClick={() => click('delta')} active={sortBy === 'delta'} className="text-right">
        δ{arrow('delta')}
      </Th>
      <Th onClick={() => click('churn')} active={sortBy === 'churn'} className="text-right">
        λ churn{arrow('churn')}
      </Th>
      <Th onClick={() => click('n')} active={sortBy === 'n'} className="text-right">
        n{arrow('n')}
      </Th>
      <Th className="text-right">η freq</Th>
      <Th className="text-right">ρ rate</Th>
    </>
  );
};

/**
 * Lightweight SVG area chart with gradient fill, gridlines, and sparse
 * x-labels; hover points show a native tooltip.
 */
export function AreaChart({ data, height = 220, id = 'chart', format = fmtCompact }) {
  if (!data || data.length === 0) {
    return <EmptyState title="No data in range" icon="📈" />;
  }
  const w = 900;
  const h = height;
  const pad = { l: 8, r: 8, t: 18, b: 26 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : (i * iw) / (data.length - 1));
  const y = (v) => pad.t + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`;
  const labelStep = Math.max(1, Math.ceil(data.length / 12));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="rgba(15,23,42,0.08)" />
      ))}
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r="8" fill="transparent">
            <title>{`${d.label}: ${fmtInt(d.value)}`}</title>
          </circle>
          {i % labelStep === 0 ? (
            <text x={x(i)} y={h - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
              {d.label}
            </text>
          ) : null}
        </g>
      ))}
      <text x={pad.l} y={12} className="fill-slate-400 text-[10px]">
        max {format(max)}
      </text>
    </svg>
  );
}
