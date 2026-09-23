import { useQuery } from '@tanstack/react-query';
import { fetchGames } from './api.ts';

export function useGames() {
  return useQuery({ queryKey: ['games'], queryFn: fetchGames, staleTime: 5 * 60_000 });
}
