-- The Edge Function checks admins with the service role, which (with auto-expose off) has no
-- privileges unless granted. Read-only is all it needs.
grant select on public.admins to service_role;

select internal.assert_security();
