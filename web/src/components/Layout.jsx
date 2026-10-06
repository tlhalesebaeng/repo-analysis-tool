import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/repos', label: 'Repos' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/files', label: 'Files' },
  { to: '/directories', label: 'Directories' },
  { to: '/authors', label: 'Authors' },
  { to: '/commits', label: 'Commits' },
];

export default function Layout() {
  return (
    <div className="layout">
      <header className="topbar">
        <span className="brand" title="Repo Analysis Tool">
          RAT
        </span>
        <nav className="nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
