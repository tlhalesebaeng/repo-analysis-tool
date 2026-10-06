import { NavLink } from 'react-router-dom';

/** Single sidebar navigation entry with a soft violet active state. */
export default function SidebarLink({ to, label, icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </NavLink>
  );
}
