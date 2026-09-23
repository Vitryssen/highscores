-- Get-or-create a player by name for the Edge Function. Matching uses the same key as the
-- players.name_key column, and an existing player's display name is never overwritten.
create function public.ensure_player(p_name text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.players (name) values (p_name)
  on conflict (name_key) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.players
    where name_key = lower(normalize(btrim(p_name), NFKC));
  end if;
  return v_id;
end;
$$;
revoke execute on function public.ensure_player(text) from public, anon, authenticated;
grant execute on function public.ensure_player(text) to service_role;

select internal.assert_security();
