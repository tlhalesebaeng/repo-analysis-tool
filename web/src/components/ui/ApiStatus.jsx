import StatusPill from './StatusPill.jsx';

function migrationSummary(count) {
  return `${count} migration${count === 1 ? '' : 's'} applied`;
}

/** Renders the /api/health state from useApi() as a status pill. */
export default function ApiStatus({ state }) {
  if (state.loading) {
    return <StatusPill tone="muted">API: connecting…</StatusPill>;
  }
  if (state.error) {
    return <StatusPill tone="danger">API: unreachable — is the server running?</StatusPill>;
  }
  const count = state.data?.migrations?.length ?? 0;
  return <StatusPill tone="success">API: ok ({migrationSummary(count)})</StatusPill>;
}
