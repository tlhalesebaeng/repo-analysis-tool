import { NAV_ITEMS } from '../../routes.jsx';
import SidebarLink from './SidebarLink.jsx';

/** Left navigation: brand mark plus one link per page. */
export default function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-slate-900">
      <div className="px-5 pt-6">
        <span className="text-xl font-bold tracking-widest text-white">RAT</span>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map(({ to, label }) => (
          <SidebarLink key={to} to={to} label={label} />
        ))}
      </nav>
    </aside>
  );
}
