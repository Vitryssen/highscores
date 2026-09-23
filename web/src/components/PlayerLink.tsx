import { Link } from 'react-router-dom';

export function PlayerLink({ name }: { name: string }) {
  return (
    <Link to={`/p/${encodeURIComponent(name)}`} className="player-link" onClick={(e) => e.stopPropagation()}>
      {name}
    </Link>
  );
}
