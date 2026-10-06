const TONES = {
  muted: 'border-slate-300 bg-slate-50 text-slate-600',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  danger: 'border-red-300 bg-red-50 text-red-700',
};

/** Small status badge; later pages reuse it for repo/import states. */
export default function StatusPill({ tone = 'muted', children }) {
  return (
    <span className={`inline-block rounded-md border px-3 py-1.5 text-sm font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
