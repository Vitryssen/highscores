import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MAX_NAME_LENGTH } from '@shared/types.ts';
import { normalizeName, validateName } from '@shared/parser.ts';
import { deletePlayer, fetchPlayers, renamePlayer, type PlayerRow } from './adminApi.ts';

export function PlayersAdmin() {
  const queryClient = useQueryClient();
  const players = useQuery({ queryKey: ['admin-players'], queryFn: fetchPlayers });
  const [error, setError] = useState<string | null>(null);

  async function rename(p: PlayerRow) {
    const input = window.prompt(`Rename ${p.name} to:`, p.name);
    if (input === null) return;
    const invalid = validateName(input);
    if (invalid) return setError(invalid);
    try {
      await renamePlayer(p.id, normalizeName(input));
      setError(null);
      await queryClient.invalidateQueries();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('name_key') ? 'Another player already has that name.' : msg);
    }
  }

  async function remove(p: PlayerRow) {
    const n = p.runs[0]?.count ?? 0;
    if (!window.confirm(`Delete ${p.name} and their ${n} run(s)? This can't be undone.`)) return;
    try {
      await deletePlayer(p.id);
      await queryClient.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="panel stack">
      <h2 className="panel-title">Players</h2>
      <p className="muted small">Names are matched case-insensitively (max {MAX_NAME_LENGTH} characters).</p>
      {error && <p className="msg error">{error}</p>}
      {players.isLoading && <p className="muted blink">LOADING…</p>}
      <div className="table-wrap">
        <table className="standings admin-table">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Runs</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {players.data?.map((p) => (
              <tr key={p.id}>
                <td className="player">{p.name}</td>
                <td className="num">{p.runs[0]?.count ?? 0}</td>
                <td className="muted small">{new Date(p.created_at).toLocaleDateString('en-GB')}</td>
                <td className="actions">
                  <button type="button" className="link-btn" onClick={() => rename(p)}>
                    Rename
                  </button>
                  <button type="button" className="link-btn danger" onClick={() => remove(p)}>
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
