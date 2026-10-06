const APP_NAME = 'Repo Analysis Tool';
const APP_TAGLINE = 'Git repository metrics dashboard';

/** Top bar: the full application name above the routed content. */
export default function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 px-8 py-4 backdrop-blur">
      <h1 className="bg-gradient-to-r from-slate-900 to-slate-500 bg-clip-text text-lg font-bold text-transparent">{APP_NAME}</h1>
      <p className="text-xs text-slate-500">{APP_TAGLINE}</p>
    </header>
  );
}
