import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section className="hero">
      <h1 className="neon">GAME OVER</h1>
      <p className="muted">That page doesn't exist.</p>
      <Link to="/" className="btn">Continue? ▶</Link>
    </section>
  );
}
