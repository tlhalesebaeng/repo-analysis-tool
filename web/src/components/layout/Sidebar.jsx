import { NAV_ITEMS } from '../../routes.jsx';
import SidebarLink from './SidebarLink.jsx';

const ICONS = { Repos: '📦', Dashboard: '📊', Files: '🗂️', Directories: '📁', Authors: '👥', Commits: '⎇' };

/** Left navigation: violet brand mark plus one link per page. */
export default function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white/70 backdrop-blur">
      <div className="px-5 pt-6 pb-2">
        <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-xl font-black tracking-widest text-transparent">
          RAT
        </span>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-slate-400">repo analysis</p>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ to, label }) => (
          <SidebarLink key={to} to={to} label={label} icon={ICONS[label]} />
        ))}
      </nav>
      <div className="mt-auto px-5 pb-6 text-[11px] leading-relaxed text-slate-400">
        λ churn · δ growth
        <br />
        η freq · ω ownership
      </div>
    </aside>
  );
}
