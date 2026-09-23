import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './styles.css';
import { Layout } from './components/Layout.tsx';
import { Home } from './pages/Home.tsx';
import { GamePage } from './pages/GamePage.tsx';
import { PuzzlePage } from './pages/PuzzlePage.tsx';
import { NotFound } from './pages/NotFound.tsx';

// Loaded on demand: public visitors never download the admin code.
const AdminApp = lazy(() => import('./admin/AdminApp.tsx'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

// Hash routing: GitHub Pages can't rewrite deep links to index.html.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/g/:slug', element: <GamePage /> },
      { path: '/g/:slug/:puzzle', element: <PuzzlePage /> },
      {
        path: '/admin',
        element: (
          <Suspense fallback={<p className="muted blink">LOADING…</p>}>
            <AdminApp />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
