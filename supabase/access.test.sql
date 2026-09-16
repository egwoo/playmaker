-- Run against an isolated database with schema.sql loaded:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/access.test.sql
-- Requires an administrative test connection; every fixture is rolled back.
begin;
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'owner@access.test'),
  ('10000000-0000-0000-0000-000000000002', 'coach@access.test'),
  ('10000000-0000-0000-0000-000000000003', 'removed@access.test'),
  ('10000000-0000-0000-0000-000000000004', 'remaining@access.test'),
  ('10000000-0000-0000-0000-000000000005', 'outsider@access.test');
insert into public.playbooks (id, owner_id, name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Access test'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'New links test');
insert into public.playbook_members (playbook_id, user_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'coach'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'player'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'player');
insert into public.playbook_shares (playbook_id, token, role) values
  ('20000000-0000-0000-0000-000000000001', 'access-test-old-coach', 'coach'),
  ('20000000-0000-0000-0000-000000000001', 'access-test-old-player', 'player');

set local role authenticated;
do $$
declare
  pid constant uuid := '20000000-0000-0000-0000-000000000001';
  owner_id constant uuid := '10000000-0000-0000-0000-000000000001';
  coach_id constant uuid := '10000000-0000-0000-0000-000000000002';
  removed_id constant uuid := '10000000-0000-0000-0000-000000000003';
  uid uuid;
  fresh_token text;
begin
  -- Both outsiders and viewers must be unable to read email addresses or remove members.
  foreach uid in array array[removed_id, '10000000-0000-0000-0000-000000000005'::uuid] loop
    perform set_config('request.jwt.claim.sub', uid::text, true);
    begin
      perform * from public.list_playbook_members(pid);
      raise exception 'Unauthorized member listing succeeded';
    exception when insufficient_privilege then null;
    end;
    begin
      perform * from public.get_or_create_playbook_share(pid, 'coach');
      raise exception 'Unauthorized link creation succeeded';
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.remove_playbook_member(pid, coach_id);
      raise exception 'Unauthorized removal succeeded';
    exception when insufficient_privilege then null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', coach_id::text, true);
  begin
    insert into public.playbook_members(playbook_id, user_id, role)
      values (pid, '10000000-0000-0000-0000-000000000005', 'coach');
    raise exception 'Direct member creation bypassed RPC';
  exception when insufficient_privilege then null;
  end;
  if public.get_or_create_playbook_share(pid, 'coach') <> 'access-test-old-coach' then
    raise exception 'Existing share link was not reused';
  end if;
  begin
    perform * from public.get_or_create_playbook_share(pid, 'invalid');
    raise exception 'Invalid share role accepted';
  exception when invalid_parameter_value then null;
  end;
  update public.playbook_shares s set token = 'bypass' where s.playbook_id = pid;
  delete from public.playbook_shares s where s.playbook_id = pid;
  if public.get_or_create_playbook_share(pid, 'coach') <> 'access-test-old-coach' then
    raise exception 'Direct mutation bypassed share RPC';
  end if;
  if (select count(*) from public.list_playbook_members(pid)) <> 4
    or not exists (select 1 from public.list_playbook_members(pid) m
      where m.is_owner and m.email = 'owner@access.test' and m.role = 'coach') then
    raise exception 'Coach member listing incorrect';
  end if;
  foreach uid in array array[owner_id, coach_id] loop
    begin
      perform public.remove_playbook_member(pid, uid);
      raise exception 'Owner/self protection failed';
    exception when insufficient_privilege then null;
    end;
  end loop;
  delete from public.playbook_members m where m.playbook_id = pid and m.user_id = removed_id;
  if not exists (select 1 from public.playbook_members m where m.playbook_id = pid and m.user_id = removed_id) then
    raise exception 'Direct delete bypassed removal RPC';
  end if;

  perform public.remove_playbook_member(pid, removed_id);
  if (select count(*) from public.list_playbook_members(pid)) <> 3 then
    raise exception 'Removal changed remaining memberships';
  end if;
  if (select count(*) from public.playbook_shares s where s.playbook_id = pid) <> 2
    or exists (select 1 from public.playbook_shares s where s.playbook_id = pid
      and s.token in ('access-test-old-coach', 'access-test-old-player')) then
    raise exception 'Both share links must be regenerated';
  end if;
  select s.token into fresh_token from public.playbook_shares s where s.playbook_id = pid and s.role = 'player';

  perform set_config('request.jwt.claim.sub', removed_id::text, true);
  if public.is_playbook_member(pid) or exists (select 1 from public.playbooks p where p.id = pid) then
    raise exception 'Removed member retains access';
  end if;
  if exists (select 1 from public.accept_playbook_share('access-test-old-coach'))
    or exists (select 1 from public.accept_playbook_share('access-test-old-player'))
    or public.is_playbook_member(pid) then
    raise exception 'An old link restored access';
  end if;
  perform * from public.accept_playbook_share(fresh_token);
  if not public.is_playbook_member(pid) then raise exception 'New invitation unusable'; end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  begin
    insert into public.playbook_shares(playbook_id, token, role)
      values ('20000000-0000-0000-0000-000000000002', 'bypass-new-link', 'coach');
    raise exception 'Direct link creation bypassed RPC';
  exception when insufficient_privilege then null;
  end;
  fresh_token := public.get_or_create_playbook_share('20000000-0000-0000-0000-000000000002', 'coach');
  if fresh_token is null or fresh_token <> public.get_or_create_playbook_share('20000000-0000-0000-0000-000000000002', 'coach') then
    raise exception 'New coach link creation is not idempotent';
  end if;
  if public.get_or_create_playbook_share('20000000-0000-0000-0000-000000000002', 'player') is null then
    raise exception 'New viewer link creation failed';
  end if;
  perform public.remove_playbook_member(pid, coach_id);
  if (select count(*) from public.list_playbook_members(pid)) <> 3 then
    raise exception 'Owner could not remove a coach';
  end if;
  delete from public.playbook_members m where m.playbook_id = pid and m.user_id = owner_id;
  if not exists (select 1 from public.list_playbook_members(pid) m where m.is_owner) then
    raise exception 'Owner can delete own membership';
  end if;
end;
$$;
rollback;
