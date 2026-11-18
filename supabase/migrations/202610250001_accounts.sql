-- LifeOS accounts + cloud saving. Run as the project owner in Supabase SQL Editor.
-- Additive, rerunnable, and transactional; existing unrelated tables are untouched.
begin;

create or replace function public.lifeos_valid_task(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare p jsonb; r jsonb; n record; total integer; count_done integer := 0; previous_end integer := 0; a integer; b integer; d text;
begin
  if jsonb_typeof(t) is distinct from 'object' or not (t ?& array['id','title','workspace','priority','repeat','done','due','start','focus']) then return false; end if;
  foreach d in array array['id','title','workspace','priority','repeat'] loop
    if jsonb_typeof(t->d) is distinct from 'string' then return false; end if;
  end loop;
  for d in select jsonb_object_keys(t) loop
    if d not in ('id','title','workspace','priority','repeat','done','due','start','focus','progress','completedAt','recurrenceParentId') then return false; end if;
  end loop;
  if t ? 'completedAt' then
    if jsonb_typeof(t->'completedAt') is distinct from 'string' then return false; end if;
    perform (t->>'completedAt')::timestamptz;
  end if;
  if jsonb_typeof(t->'id') <> 'string' or length(t->>'id') not between 1 and 160 then return false; end if;
  if jsonb_typeof(t->'title') <> 'string' or length(trim(t->>'title')) not between 1 and 180 then return false; end if;
  if (t->>'workspace') not in ('University 01','University 02','Startup 01','Startup 02','Personal Growth') then return false; end if;
  if (t->>'priority') not in ('High','Medium','Low') or (t->>'repeat') not in ('None','Daily','Weekly','Monthly') then return false; end if;
  if jsonb_typeof(t->'done') <> 'boolean' then return false; end if;
  foreach d in array array['start','due','focus'] loop
    if jsonb_typeof(t->d) is distinct from 'string' then return false; end if;
    if t->>d <> '' and ((t->>d) !~ '^\d{4}-\d{2}-\d{2}$' or to_char((t->>d)::date,'YYYY-MM-DD') <> t->>d) then return false; end if;
  end loop;
  if t->>'start' <> '' and t->>'due' <> '' and t->>'start' > t->>'due' then return false; end if;
  if t ? 'recurrenceParentId' and (jsonb_typeof(t->'recurrenceParentId') <> 'string' or length(t->>'recurrenceParentId') not between 1 and 160 or t->>'recurrenceParentId' = t->>'id') then return false; end if;
  p := t->'progress';
  if p is null or p = 'null'::jsonb then return true; end if;
  if jsonb_typeof(p) is distinct from 'object' or not (p ?& array['total','completed','unit','completedRanges','names']) or jsonb_typeof(p->'total') <> 'number' or jsonb_typeof(p->'completed') <> 'number' then return false; end if;
  total := (p->>'total')::integer;
  if total not between 1 and 1000000 or (p->>'total')::numeric <> total then return false; end if;
  if jsonb_typeof(p->'unit') <> 'string' or length(trim(p->>'unit')) not between 1 and 30 then return false; end if;
  if jsonb_typeof(p->'completedRanges') <> 'array' or jsonb_typeof(p->'names') <> 'object' then return false; end if;
  for r in select value from jsonb_array_elements(p->'completedRanges') loop
    if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> 2 or jsonb_typeof(r->0) is distinct from 'number' or jsonb_typeof(r->1) is distinct from 'number' then return false; end if;
    a := (r->>0)::integer; b := (r->>1)::integer;
    if (r->>0)::numeric <> a or (r->>1)::numeric <> b or a < 1 or b > total or a > b or a <= previous_end then return false; end if;
    count_done := count_done + b - a + 1; previous_end := b;
  end loop;
  if (p->>'completed')::numeric <> count_done or (t->>'done')::boolean <> (count_done = total) then return false; end if;
  for n in select key,value from jsonb_each(p->'names') loop
    if n.key !~ '^\d+$' or n.key::integer not between 1 and total or jsonb_typeof(n.value) <> 'string' or length(n.value #>> '{}') > 120 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.lifeos_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null default 'Player one' check (length(player_name) between 1 and 50),
  time_zone text not null default 'Asia/Colombo'
);
create table if not exists public.lifeos_workspaces (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name in ('University 01','University 02','Startup 01','Startup 02','Personal Growth')),
  primary key(user_id,name)
);
create table if not exists public.lifeos_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 160),
  data jsonb not null check (public.lifeos_valid_task(data)) check (data->>'id' = id),
  workspace text generated always as (data->>'workspace') stored not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,id),
  foreign key(user_id,workspace) references public.lifeos_workspaces(user_id,name)
);
create unique index if not exists lifeos_one_successor on public.lifeos_tasks(user_id,(data->>'recurrenceParentId')) where data ? 'recurrenceParentId';
create table if not exists public.lifeos_imports (
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id text not null,
  imported_at timestamptz not null default now(),
  primary key(user_id,source_id)
);

alter table public.lifeos_profiles enable row level security;
alter table public.lifeos_workspaces enable row level security;
alter table public.lifeos_tasks enable row level security;
alter table public.lifeos_imports enable row level security;
drop policy if exists lifeos_own_profile on public.lifeos_profiles;
create policy lifeos_own_profile on public.lifeos_profiles for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists lifeos_own_workspaces on public.lifeos_workspaces;
create policy lifeos_own_workspaces on public.lifeos_workspaces for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists lifeos_own_tasks on public.lifeos_tasks;
create policy lifeos_own_tasks on public.lifeos_tasks for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists lifeos_own_imports on public.lifeos_imports;
create policy lifeos_own_imports on public.lifeos_imports for select to authenticated using ((select auth.uid()) = user_id);
-- All writes go through the constrained functions below, not direct REST writes.
revoke all on public.lifeos_profiles,public.lifeos_workspaces,public.lifeos_tasks,public.lifeos_imports from anon,authenticated;
grant select on public.lifeos_profiles,public.lifeos_workspaces,public.lifeos_tasks,public.lifeos_imports to authenticated;

create or replace function public.lifeos_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); task_data jsonb; versions jsonb; name text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  insert into public.lifeos_profiles(user_id,player_name)
    values(uid,coalesce(nullif(left(trim(auth.jwt()#>>'{user_metadata,player_name}'),50),''),'Player one')) on conflict do nothing;
  insert into public.lifeos_workspaces(user_id,name)
    select uid,unnest(array['University 01','University 02','Startup 01','Startup 02','Personal Growth']) on conflict do nothing;
  select coalesce(jsonb_agg(data order by created_at,id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb)
    into task_data,versions from public.lifeos_tasks where user_id=uid;
  select player_name into name from public.lifeos_profiles where user_id=uid;
  return jsonb_build_object('tasks',task_data,'versions',versions,'playerName',name);
end;
$$;

create or replace function public.lifeos_commit(p_task jsonb,p_expected_version bigint,p_successor jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); existing public.lifeos_tasks%rowtype;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform public.lifeos_load();
  if not public.lifeos_valid_task(p_task) then raise exception 'Invalid task' using errcode='22023'; end if;
  select * into existing from public.lifeos_tasks where user_id=uid and id=p_task->>'id' for update;
  if p_expected_version is null then
    if existing.id is not null then raise exception 'Stale task' using errcode='40001'; end if;
    insert into public.lifeos_tasks(user_id,id,data) values(uid,p_task->>'id',p_task);
  else
    if existing.id is null or existing.version <> p_expected_version then raise exception 'Stale task' using errcode='40001'; end if;
    update public.lifeos_tasks set data=p_task,version=version+1,updated_at=now() where user_id=uid and id=existing.id;
  end if;
  if p_successor is not null then
    if not public.lifeos_valid_task(p_successor) or p_successor->>'recurrenceParentId' is distinct from p_task->>'id'
       or (p_task->>'done')::boolean is not true or (p_successor->>'done')::boolean is not false
       or p_task->>'repeat' = 'None' or (existing.data->>'done')::boolean is true
       or coalesce((p_successor#>>'{progress,completed}')::integer,0) <> 0 then
      raise exception 'Invalid successor' using errcode='22023';
    end if;
    insert into public.lifeos_tasks(user_id,id,data) values(uid,p_successor->>'id',p_successor);
  end if;
  return public.lifeos_load();
end;
$$;

create or replace function public.lifeos_delete(p_id text,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); removed text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  delete from public.lifeos_tasks where user_id=uid and id=p_id and version=p_expected_version returning id into removed;
  if removed is null then raise exception 'Stale task' using errcode='40001'; end if;
  return public.lifeos_load();
end;
$$;

create or replace function public.lifeos_import(p_tasks jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); t jsonb; imported text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_array_length(p_tasks) not between 1 and 5000 then raise exception 'Invalid import' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform public.lifeos_load();
  for t in select value from jsonb_array_elements(p_tasks) loop
    if not public.lifeos_valid_task(t) then raise exception 'Invalid imported task' using errcode='22023'; end if;
  end loop;
  for t in select value from jsonb_array_elements(p_tasks) loop
    imported := null;
    insert into public.lifeos_imports(user_id,source_id) values(uid,t->>'id') on conflict do nothing returning source_id into imported;
    if imported is not null then
      insert into public.lifeos_tasks(user_id,id,data) values(uid,t->>'id',t) on conflict(user_id,id) do nothing;
    end if;
  end loop;
  return public.lifeos_load();
end;
$$;

revoke all on function public.lifeos_load(),public.lifeos_commit(jsonb,bigint,jsonb),public.lifeos_delete(text,bigint),public.lifeos_import(jsonb) from public,anon;
grant execute on function public.lifeos_load(),public.lifeos_commit(jsonb,bigint,jsonb),public.lifeos_delete(text,bigint),public.lifeos_import(jsonb) to authenticated;
commit;
