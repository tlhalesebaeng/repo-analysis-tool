import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import { PAGES } from './routes.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/repos" replace /> },
      ...PAGES.map(({ path, element }) => ({ path, element })),
    ],
  },
]);
