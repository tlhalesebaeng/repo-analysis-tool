const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n) => (n ?? 0).toLocaleString('en-US');
export const fmtCompact = (n) => compact.format(n ?? 0);
export const fmtPct = (x) => `${((x ?? 0) * 100).toFixed((x ?? 0) < 0.1 && (x ?? 0) > 0 ? 1 : 0)}%`;
export const fmtDelta = (n) => `${(n ?? 0) > 0 ? '+' : ''}${compact.format(n ?? 0)}`;
export const fmtDate = (ts) =>
  ts ? new Date(ts * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
export const fmtDateTime = (ts) =>
  ts
    ? new Date(ts * 1000).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

/** datetime-local input value (local time) → unix seconds. */
export const localToTs = (value) => (value ? Math.floor(new Date(value).getTime() / 1000) : null);
/** unix seconds → datetime-local input value. */
export const tsToLocal = (ts) => (ts ? new Date(ts * 1000).toISOString().slice(0, 16) : '');
