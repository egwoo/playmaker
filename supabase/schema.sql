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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.play_shares (
  id uuid primary key default gen_random_uuid(),
  play_id uuid not null references public.plays(id) on delete cascade,
  token text not null unique,
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
as $$
  select exists (
    select 1
    from public.playbook_members m
    where m.playbook_id = pid
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_playbook_coach(pid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.playbook_members m
    where m.playbook_id = pid
      and m.user_id = auth.uid()
      and m.role = 'coach'
  );
$$;

alter table public.playbooks enable row level security;
alter table public.playbook_members enable row level security;
alter table public.plays enable row level security;
alter table public.play_shares enable row level security;

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
for insert with check (public.is_playbook_coach(playbook_id));

drop policy if exists "members_update" on public.playbook_members;
create policy "members_update" on public.playbook_members
for update using (public.is_playbook_coach(playbook_id));

drop policy if exists "members_delete" on public.playbook_members;
create policy "members_delete" on public.playbook_members
for delete using (public.is_playbook_coach(playbook_id));

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
