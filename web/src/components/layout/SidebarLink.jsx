import { NavLink } from 'react-router-dom';

/** Single sidebar navigation entry with gradient active-state styling. */
export default function SidebarLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-gradient-to-r from-violet-500/25 to-fuchsia-500/10 text-white shadow-inner'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </NavLink>
  );
}
