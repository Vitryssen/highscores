import { Link, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <>
      <header className="site-header">
        <Link to="/" className="logo" aria-label="Highscores home">
          HIGH<span>SCORES</span>
        </Link>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
      <footer className="site-footer muted">
        One run per player per puzzle · F1 points: 25-18-15-12-10-8-6-4-2-1 ·{' '}
        <Link to="/request">Request a game</Link> · <Link to="/admin">Admin</Link>
      </footer>
    </>
  );
}
