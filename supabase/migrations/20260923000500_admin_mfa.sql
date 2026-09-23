-- Admin writes require an MFA-verified session (assurance level aal2). Being listed in admins
-- with only a password session is not enough, so a leaked password alone can't change data.
create or replace function public.is_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
     and exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

select internal.assert_security();
