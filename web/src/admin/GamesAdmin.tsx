import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game } from '@shared/types.ts';
import { currentPuzzle } from '@shared/puzzleDate.ts';
import { puzzleLabel } from '../lib/format.ts';
import { deleteGame, fetchAllGames } from './adminApi.ts';
import { GameEditor } from './GameEditor.tsx';

export function GamesAdmin() {
  const queryClient = useQueryClient();
  const games = useQuery({ queryKey: ['admin-games'], queryFn: fetchAllGames });
  const [editing, setEditing] = useState<Game | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries();

  if (editing) {
    return (
      <GameEditor
        game={editing === 'new' ? null : editing}
        onDone={(saved) => {
          setEditing(null);
          if (saved) refresh();
        }}
      />
    );
  }

  async function remove(g: Game) {
    const typed = window.prompt(
      `Delete ${g.name} and ALL its runs permanently? This can't be undone.\nType the slug "${g.slug}" to confirm. (To just hide it, edit it and untick Active.)`,
    );
    if (typed !== g.slug) return;
    try {
      await deleteGame(g.id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="panel stack">
      <div className="panel-head">
        <h2 className="panel-title">Games</h2>
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          + NEW GAME
        </button>
      </div>
      {error && <p className="msg error">{error}</p>}
      {games.isLoading && <p className="muted blink">LOADING…</p>}
      <div className="table-wrap">
        <table className="standings admin-table">
          <thead>
            <tr>
              <th>Game</th>
              <th>Today</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {games.data?.map((g) => (
              <tr key={g.id}>
                <td className="player">
                  {g.name} <span className="muted small">/{g.slug}</span>
                </td>
                <td>{puzzleLabel(g, currentPuzzle(g))}</td>
                <td>{g.active ? <span className="points">Active</span> : <span className="muted">Hidden</span>}</td>
                <td className="actions">
                  <button type="button" className="link-btn" onClick={() => setEditing(g)}>
                    Edit
                  </button>
                  <button type="button" className="link-btn danger" onClick={() => remove(g)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
