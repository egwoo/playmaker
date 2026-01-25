-- Playmaker Supabase schema + RLS policies

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.playbook_members (
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('coach', 'player')),
  created_at timestamptz not null default now(),
  primary key (playbook_id, user_id)
);

create table if not exists public.plays (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  name text not null,
  data jsonb not null,
  notes text,
  tags text[] not null default '{}',
  sort_order bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plays add column if not exists sort_order bigint;

create or replace function public.set_play_sort_order()
returns trigger
language plpgsql
as $$
begin
  if new.sort_order is null then
    select coalesce(max(sort_order), 0) + 1
      into new.sort_order
      from public.plays
      where playbook_id = new.playbook_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_play_sort_order on public.plays;
create trigger set_play_sort_order
before insert on public.plays
for each row execute function public.set_play_sort_order();

with ranked as (
  select
    id,
    row_number() over (partition by playbook_id order by updated_at desc) as rn,
    count(*) over (partition by playbook_id) as total
  from public.plays
)
update public.plays p
set sort_order = ranked.total - ranked.rn + 1
from ranked
where p.id = ranked.id
  and p.sort_order is null;

create table if not exists public.play_shares (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays(id) on delete cascade,
  play_name text not null,
  play_data jsonb not null,
  token text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.play_shares add column if not exists play_name text;
alter table public.play_shares add column if not exists play_data jsonb;
alter table public.play_shares add column if not exists created_by uuid references auth.users(id) on delete set null;

create table if not exists public.playbook_shares (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  token text not null unique,
  role text not null check (role in ('coach', 'player')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (playbook_id, role)
);

create unique index if not exists playbook_shares_unique_role on public.playbook_shares (playbook_id, role);

create table if not exists public.play_versions (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_plays_updated_at on public.plays;
create trigger set_plays_updated_at
before update on public.plays
for each row execute function public.set_updated_at();

create or replace function public.add_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.playbook_members (playbook_id, user_id, role)
  values (new.id, new.owner_id, 'coach');
  return new;
end;
$$;

drop trigger if exists playbooks_owner_member on public.playbooks;
create trigger playbooks_owner_member
after insert on public.playbooks
for each row execute function public.add_owner_member();

create or replace function public.is_playbook_member(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.playbooks p
    left join public.playbook_members m
      on m.playbook_id = p.id
      and m.user_id = auth.uid()
    where p.id = pid
      and (p.owner_id = auth.uid() or m.user_id is not null)
  );
$$;

create or replace function public.is_playbook_coach(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.playbooks p
    left join public.playbook_members m
      on m.playbook_id = p.id
      and m.user_id = auth.uid()
    where p.id = pid
      and (p.owner_id = auth.uid() or m.role = 'coach')
  );
$$;

create or replace function public.fetch_play_share(share_token text)
returns table (
  id uuid,
  play_name text,
  play_data jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select id, play_name, play_data, created_at
  from public.play_shares
  where token = share_token
  limit 1;
$$;

create or replace function public.fetch_playbook_share(share_token text)
returns table (
  playbook_id uuid,
  role text,
  playbook_name text
)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select s.playbook_id,
         s.role,
         (select name from public.playbooks p where p.id = s.playbook_id) as playbook_name
  from public.playbook_shares s
  where s.token = share_token
  limit 1;
$$;

create or replace function public.accept_playbook_share(share_token text)
returns table (
  playbook_id uuid,
  role text,
  playbook_name text
)
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  share_row record;
begin
  select * into share_row
  from public.playbook_shares
  where token = share_token
  limit 1;

  if share_row is null then
    return;
  end if;

  insert into public.playbook_members (playbook_id, user_id, role)
  values (share_row.playbook_id, auth.uid(), share_row.role)
  on conflict on constraint playbook_members_pkey do update
    set role = case
      when public.playbook_members.role = 'coach' or excluded.role = 'coach' then 'coach'
      else public.playbook_members.role
    end;

  return query
    select share_row.playbook_id,
           share_row.role,
           (select name from public.playbooks p where p.id = share_row.playbook_id);
end;
$$;

create or replace function public.prune_play_versions(pid uuid)
returns void
language sql
security definer
set search_path = public
set row_security = off
as $$
  delete from public.play_versions
  where play_id = pid
    and id not in (
      select id
      from public.play_versions
      where play_id = pid
      order by created_at desc
      limit 20
    );
$$;

alter table public.playbooks enable row level security;
alter table public.playbook_members enable row level security;
alter table public.plays enable row level security;
alter table public.play_shares enable row level security;
alter table public.playbook_shares enable row level security;
alter table public.play_versions enable row level security;

drop policy if exists "playbooks_read" on public.playbooks;
create policy "playbooks_read" on public.playbooks
for select using (
  owner_id = auth.uid() or public.is_playbook_member(id)
);

drop policy if exists "playbooks_insert" on public.playbooks;
create policy "playbooks_insert" on public.playbooks
for insert with check (owner_id = auth.uid());

drop policy if exists "playbooks_update" on public.playbooks;
create policy "playbooks_update" on public.playbooks
for update using (public.is_playbook_coach(id));

drop policy if exists "playbooks_delete" on public.playbooks;
create policy "playbooks_delete" on public.playbooks
for delete using (public.is_playbook_coach(id));

drop policy if exists "members_read" on public.playbook_members;
create policy "members_read" on public.playbook_members
for select using (public.is_playbook_member(playbook_id));

drop policy if exists "members_insert" on public.playbook_members;
create policy "members_insert" on public.playbook_members
for insert with check (
  public.is_playbook_coach(playbook_id)
  or exists (
    select 1
    from public.playbooks p
    where p.id = playbook_id
      and p.owner_id = auth.uid()
  )
);

drop policy if exists "members_update" on public.playbook_members;
create policy "members_update" on public.playbook_members
for update using (public.is_playbook_coach(playbook_id));

drop policy if exists "members_delete" on public.playbook_members;
create policy "members_delete" on public.playbook_members
for delete using (
  public.is_playbook_coach(playbook_id)
  or user_id = auth.uid()
);

drop policy if exists "plays_read" on public.plays;
create policy "plays_read" on public.plays
for select using (public.is_playbook_member(playbook_id));

drop policy if exists "plays_write" on public.plays;
create policy "plays_write" on public.plays
for all using (public.is_playbook_coach(playbook_id)) with check (public.is_playbook_coach(playbook_id));

drop policy if exists "play_shares_read" on public.play_shares;
create policy "play_shares_read" on public.play_shares
for select using (public.is_playbook_member((select playbook_id from public.plays p where p.id = play_id)));

drop policy if exists "play_shares_write" on public.play_shares;
create policy "play_shares_write" on public.play_shares
for insert with check (
  public.is_playbook_coach((select playbook_id from public.plays p where p.id = play_id))
);

drop policy if exists "play_shares_delete" on public.play_shares;
create policy "play_shares_delete" on public.play_shares
for delete using (
  public.is_playbook_coach((select playbook_id from public.plays p where p.id = play_id))
);

drop policy if exists "playbook_shares_read" on public.playbook_shares;
create policy "playbook_shares_read" on public.playbook_shares
for select using (public.is_playbook_coach(playbook_id));

drop policy if exists "playbook_shares_write" on public.playbook_shares;
create policy "playbook_shares_write" on public.playbook_shares
for insert with check (public.is_playbook_coach(playbook_id));

drop policy if exists "playbook_shares_update" on public.playbook_shares;
create policy "playbook_shares_update" on public.playbook_shares
for update using (public.is_playbook_coach(playbook_id));

drop policy if exists "playbook_shares_delete" on public.playbook_shares;
create policy "playbook_shares_delete" on public.playbook_shares
for delete using (public.is_playbook_coach(playbook_id));

drop policy if exists "play_versions_read" on public.play_versions;
create policy "play_versions_read" on public.play_versions
for select using (public.is_playbook_member((select playbook_id from public.plays p where p.id = play_id)));

drop policy if exists "play_versions_write" on public.play_versions;
create policy "play_versions_write" on public.play_versions
for insert with check (
  public.is_playbook_coach((select playbook_id from public.plays p where p.id = play_id))
);

drop policy if exists "play_versions_delete" on public.play_versions;
create policy "play_versions_delete" on public.play_versions
for delete using (
  public.is_playbook_coach((select playbook_id from public.plays p where p.id = play_id))
);
