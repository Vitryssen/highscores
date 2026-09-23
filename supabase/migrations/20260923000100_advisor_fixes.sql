-- Security Advisor fixes: no SECURITY DEFINER functions callable through the API.

-- is_admin() now runs with the caller's rights. Signed-in users may read only their own
-- admins row, which is all is_admin() needs. Anonymous callers can't execute it.
grant select on public.admins to authenticated;
create policy "read own admin row" on public.admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Supabase's automatic-RLS event trigger function. Event triggers are fired by the database
-- itself, so revoking API access doesn't affect it.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

select internal.assert_security();
