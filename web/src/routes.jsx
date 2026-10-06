import ReposPage from './pages/ReposPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import FilesPage from './pages/FilesPage.jsx';
import DirectoriesPage from './pages/DirectoriesPage.jsx';
import AuthorsPage from './pages/AuthorsPage.jsx';
import CommitsPage from './pages/CommitsPage.jsx';

/**
 * Single source of truth for app pages: the browser router mounts each
 * entry's element and the sidebar renders one link per entry, so paths
 * can never drift between navigation and routing.
 */
export const PAGES = [
  { path: 'repos', label: 'Repos', element: <ReposPage /> },
  { path: 'dashboard', label: 'Dashboard', element: <DashboardPage /> },
  { path: 'files', label: 'Files', element: <FilesPage /> },
  { path: 'directories', label: 'Directories', element: <DirectoriesPage /> },
  { path: 'authors', label: 'Authors', element: <AuthorsPage /> },
  { path: 'commits', label: 'Commits', element: <CommitsPage /> },
];

export const NAV_ITEMS = PAGES.map(({ path, label }) => ({ to: `/${path}`, label }));
