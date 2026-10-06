const APP_NAME = 'Repo Analysis Tool';
const APP_TAGLINE = 'Git repository metrics dashboard';

/** Top bar: the full application name above the routed content. */
export default function TopBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-8 py-4">
      <h1 className="text-lg font-bold text-slate-900">{APP_NAME}</h1>
      <p className="text-sm text-slate-500">{APP_TAGLINE}</p>
    </header>
  );
}
