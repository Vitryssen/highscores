-- Game requests: visitors ask for a new game through the `request-game` Edge Function, and the
-- admin adds or declines it. Public columns live in game_requests. The link, sample paste and
-- note are in game_request_details, which only the admin can read, so visitors never see
-- user-written links.

create table public.game_requests (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(name) between 1 and 60 and name !~ '[[:cntrl:]]'),
  requested_by   text check (requested_by is null
                             or (length(requested_by) between 1 and 32 and requested_by !~ '[[:cntrl:]]')),
  status         text not null default 'pending' check (status in ('pending', 'added', 'declined')),
  decline_reason text check (decline_reason is null
                             or (length(decline_reason) between 1 and 200 and decline_reason !~ '[[:cntrl:]]')),
  game_id        uuid references public.games (id) on delete set null,
  votes          int not null default 1 check (votes >= 1),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,

  check ((status = 'pending') = (resolved_at is null)),
  check (status = 'declined' or decline_reason is null)
);

create table public.game_request_details (
  request_id   uuid primary key references public.game_requests (id) on delete cascade,
  url          text not null check (url ~ '^https://' and length(url) <= 300),
  -- Host and path of url, lowercased without www. or index.html. Duplicate requests match on it.
  url_key      text not null check (length(url_key) between 1 and 300),
  sample_paste text not null check (length(sample_paste) between 1 and 2000),
  note         text check (note is null or length(note) between 1 and 300)
);
create index game_request_details_url_key_idx on public.game_request_details (url_key);

-- One +1 per visitor (keyed IP hash) per pending request. Cleared once the request is resolved.
create table public.game_request_votes (
  request_id uuid not null references public.game_requests (id) on delete cascade,
  voter_key  text not null check (length(voter_key) <= 64),
  primary key (request_id, voter_key)
);

alter table public.game_requests        enable row level security;
alter table public.game_request_details enable row level security;
alter table public.game_request_votes   enable row level security;

revoke all on public.game_requests, public.game_request_details, public.game_request_votes
  from anon, authenticated;
grant select on public.game_requests to anon, authenticated;
grant update, delete on public.game_requests to authenticated;
grant select on public.game_request_details to authenticated;
grant select, insert, update, delete
  on public.game_requests, public.game_request_details, public.game_request_votes to service_role;

create policy "public read" on public.game_requests for select to anon, authenticated using (true);
create policy "admin write" on public.game_requests for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin read" on public.game_request_details for select to authenticated
  using ((select public.is_admin()));
-- game_request_votes: no policies, so only the Edge Function (service role) can touch it.

-- Votes only matter while a request is pending, so the keyed IP hashes go once it's resolved.
create function internal.clear_request_votes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.game_request_votes where request_id = new.id;
  return new;
end;
$$;
create trigger clear_votes_on_resolve
  after update of status on public.game_requests
  for each row when (old.status = 'pending' and new.status <> 'pending')
  execute function internal.clear_request_votes();

-- Creates a request, or counts a +1 on an existing one with the same url_key. Called by the
-- Edge Function only. A per-url_key lock makes simultaneous duplicates count as votes.
create function public.create_game_request(
  p_name text, p_url text, p_url_key text, p_sample text, p_note text, p_requested_by text,
  p_voter text, p_max_pending int
) returns table (request_id uuid, name text, status text, decline_reason text, outcome text)
language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.game_requests;
  v_id uuid;
  v_voted int;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('game_request:' || p_url_key));

  select r.* into v_existing
  from public.game_requests r join public.game_request_details d on d.request_id = r.id
  where d.url_key = p_url_key
  order by r.status = 'pending' desc, r.created_at desc
  limit 1;

  if found then
    if v_existing.status = 'pending' then
      insert into public.game_request_votes (request_id, voter_key) values (v_existing.id, p_voter)
      on conflict do nothing;
      get diagnostics v_voted = row_count;
      if v_voted > 0 then
        update public.game_requests set votes = votes + 1 where id = v_existing.id;
      end if;
      return query select v_existing.id, v_existing.name, v_existing.status, null::text,
        case when v_voted > 0 then 'voted' else 'already_voted' end;
    else
      return query select v_existing.id, v_existing.name, v_existing.status, v_existing.decline_reason,
        'resolved'::text;
    end if;
    return;
  end if;

  if (select count(*) from public.game_requests r where r.status = 'pending') >= p_max_pending then
    return query select null::uuid, null::text, null::text, null::text, 'full'::text;
    return;
  end if;

  insert into public.game_requests (name, requested_by) values (p_name, p_requested_by)
  returning id into v_id;
  insert into public.game_request_details (request_id, url, url_key, sample_paste, note)
  values (v_id, p_url, p_url_key, p_sample, p_note);
  insert into public.game_request_votes (request_id, voter_key) values (v_id, p_voter);
  return query select v_id, p_name, 'pending'::text, null::text, 'created'::text;
end;
$$;
revoke execute on function
  public.create_game_request(text, text, text, text, text, text, text, int) from public, anon, authenticated;
grant execute on function
  public.create_game_request(text, text, text, text, text, text, text, int) to service_role;

select internal.assert_security();
