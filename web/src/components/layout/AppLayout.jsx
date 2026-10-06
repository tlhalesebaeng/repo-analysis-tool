import { Outlet } from 'react-router-dom';
import { FilterProvider } from '../../store.jsx';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/** App shell: sidebar navigation on the left, top bar, routed page content. */
export default function AppLayout() {
  return (
    <FilterProvider>
      <div className="flex min-h-screen bg-slate-950 text-slate-200">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </FilterProvider>
  );
}
