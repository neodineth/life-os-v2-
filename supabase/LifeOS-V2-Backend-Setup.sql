-- LifeOS V2 complete setup. No focus uploads.
begin;

-- LifeOS accounts + cloud saving. Run as the project owner in Supabase SQL Editor.
-- Additive, rerunnable, and transactional; existing unrelated tables are untouched.


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




create or replace function public.lifeos_valid_calendar_task(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; k text;
begin
  if jsonb_typeof(t) is distinct from 'object' or not (t ?& array['id','title']) then return false; end if;
  for k in select jsonb_object_keys(t) loop if k not in ('id','title','levels','note') then return false; end if; end loop;
  if jsonb_typeof(t->'id') is distinct from 'string' or length(t->>'id') not between 1 and 160 or jsonb_typeof(t->'title') is distinct from 'string' or length(t->>'title') not between 1 and 180 then return false; end if;
  if t ? 'note' and (jsonb_typeof(t->'note') is distinct from 'string' or length(t->>'note') > 1000) then return false; end if;
  if t ? 'levels' then
    if jsonb_typeof(t->'levels') is distinct from 'array' then return false; end if;
    for item in select value from jsonb_array_elements(t->'levels') loop
      if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['number','title']) or jsonb_typeof(item->'number') is distinct from 'number' or (item->>'number')::numeric not between 1 and 1000000 or (item->>'number')::numeric <> trunc((item->>'number')::numeric) or jsonb_typeof(item->'title') is distinct from 'string' then return false; end if;
    end loop;
  end if;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.lifeos_valid_calendar_details(b jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(b) is distinct from 'object' or not public.lifeos_valid_calendar_task(b->'task') or b->>'workspace' not in ('University 01','University 02','Startup 01','Startup 02','Personal Growth') or jsonb_typeof(b->'workspace') is distinct from 'string' or jsonb_typeof(b->'start') is distinct from 'number' or jsonb_typeof(b->'end') is distinct from 'number' then return false; end if;
  return (b->>'start')::numeric >= 0 and (b->>'end')::numeric > (b->>'start')::numeric and (b->>'end')::numeric <= 253402300799999 and (b->>'end')::numeric - (b->>'start')::numeric <= 604800000;
exception when others then return false;
end;
$$;

create or replace function public.lifeos_valid_calendar_block(b jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare r jsonb; day jsonb; until_day date; first_day date; k text;
begin
  if not public.lifeos_valid_calendar_details(b) or jsonb_typeof(b->'id') is distinct from 'string' or jsonb_typeof(b->'timeZone') is distinct from 'string' then return false; end if;
  perform (b->>'id')::uuid;
  for k in select jsonb_object_keys(b) loop if k not in ('id','task','workspace','start','end','timeZone','repeat') then return false; end if; end loop;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=b->>'timeZone') then return false; end if;
  r := b->'repeat';
  if jsonb_typeof(r) is distinct from 'object' or not (r ?& array['frequency','weekdays','until']) or jsonb_typeof(r->'frequency') is distinct from 'string' or r->>'frequency' not in ('none','daily','weekly') or jsonb_typeof(r->'weekdays') is distinct from 'array' or jsonb_array_length(r->'weekdays') > 7 then return false; end if;
  if r->>'frequency'='weekly' and jsonb_array_length(r->'weekdays')=0 then return false; end if;
  for day in select value from jsonb_array_elements(r->'weekdays') loop if jsonb_typeof(day) is distinct from 'number' or day::text::numeric not between 0 and 6 or day::text::numeric <> trunc(day::text::numeric) then return false; end if; end loop;
  if r->'until' <> 'null'::jsonb then
    if jsonb_typeof(r->'until') is distinct from 'string' or (r->>'until') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    until_day := (r->>'until')::date;
    first_day := (to_timestamp((b->>'start')::double precision/1000) at time zone (b->>'timeZone'))::date;
    if until_day < first_day then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;

create table if not exists public.lifeos_calendar_series (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  data jsonb not null check(public.lifeos_valid_calendar_block(data)) check(data->>'id'=id::text),
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  primary key(user_id,id)
);
create table if not exists public.lifeos_calendar_exceptions (
  user_id uuid not null,
  series_id uuid not null,
  original_date date not null,
  data jsonb not null,
  primary key(user_id,series_id,original_date),
  foreign key(user_id,series_id) references public.lifeos_calendar_series(user_id,id) on delete cascade
);
alter table public.lifeos_calendar_series enable row level security;
alter table public.lifeos_calendar_exceptions enable row level security;
drop policy if exists lifeos_calendar_own on public.lifeos_calendar_series;
create policy lifeos_calendar_own on public.lifeos_calendar_series for select to authenticated using((select auth.uid())=user_id);
drop policy if exists lifeos_exceptions_own on public.lifeos_calendar_exceptions;
create policy lifeos_exceptions_own on public.lifeos_calendar_exceptions for select to authenticated using((select auth.uid())=user_id);
revoke all on public.lifeos_calendar_series,public.lifeos_calendar_exceptions from anon,authenticated;
grant select on public.lifeos_calendar_series,public.lifeos_calendar_exceptions to authenticated;

create or replace function public.lifeos_calendar_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); zone text; blocks jsonb; exceptions jsonb; versions jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.lifeos_load();
  select time_zone into zone from public.lifeos_profiles where user_id=uid;
  select coalesce(jsonb_agg(data order by id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into blocks,versions from public.lifeos_calendar_series where user_id=uid;
  select coalesce(jsonb_agg(data),'[]'::jsonb) into exceptions from public.lifeos_calendar_exceptions where user_id=uid;
  return jsonb_build_object('timeZone',zone,'blocks',blocks,'exceptions',exceptions,'versions',versions);
end;
$$;

create or replace function public.lifeos_calendar_mutate(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); b jsonb; ex jsonb; existing public.lifeos_calendar_series%rowtype; task_data jsonb; sid uuid; d date; first_day date; last_day date; expected bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform public.lifeos_load();
  expected := (p_command->>'expectedVersion')::bigint;
  if p_command->>'action'='save' then
    b:=p_command->'block';
    if not public.lifeos_valid_calendar_block(b) then raise exception 'Invalid planned block' using errcode='22023'; end if;
    sid:=(b->>'id')::uuid;
  elsif p_command->>'action'='exception' then
    ex:=p_command->'exception'; sid:=(ex->>'seriesId')::uuid;
    if jsonb_typeof(ex) is distinct from 'object' or not(ex ?& array['seriesId','date','cancelled']) or jsonb_typeof(ex->'cancelled') is distinct from 'boolean' or (ex->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid occurrence' using errcode='22023'; end if;
    d:=(ex->>'date')::date;
    if (ex->>'cancelled')::boolean is false and not public.lifeos_valid_calendar_details(ex->'override') then raise exception 'Invalid occurrence times' using errcode='22023'; end if;
  elsif p_command->>'action'='delete' then sid:=(p_command->>'id')::uuid;
  else raise exception 'Invalid calendar operation' using errcode='22023'; end if;
  select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid for update;
  if p_command->>'action'='save' and existing.data=b then return public.lifeos_calendar_load(); end if;
  if p_command->>'action'='delete' and existing.id is null then return public.lifeos_calendar_load(); end if;
  if p_command->>'action'='exception' and exists(select 1 from public.lifeos_calendar_exceptions where user_id=uid and series_id=sid and original_date=d and data=ex) then return public.lifeos_calendar_load(); end if;
  if (expected is null and existing.id is not null) or (expected is not null and (existing.id is null or existing.version<>expected)) or (p_command->>'action'<>'save' and expected is null) then raise exception 'Stale calendar block' using errcode='40001'; end if;
  if p_command->>'action'='save' or (p_command->>'action'='exception' and (ex->>'cancelled')::boolean is false) then
    select data into task_data from public.lifeos_tasks where user_id=uid and id=coalesce(b#>>'{task,id}',ex#>>'{override,task,id}');
    if task_data is null or task_data->>'workspace' is distinct from coalesce(b->>'workspace',ex#>>'{override,workspace}') then raise exception 'Task is unavailable' using errcode='22023'; end if;
  end if;
  if p_command->>'action'='save' then
    if existing.id is null then insert into public.lifeos_calendar_series(user_id,id,data) values(uid,sid,b);
    else update public.lifeos_calendar_series set data=b,version=version+1,updated_at=now() where user_id=uid and id=sid; end if;
  elsif p_command->>'action'='exception' then
    first_day:=(to_timestamp((existing.data->>'start')::double precision/1000) at time zone (existing.data->>'timeZone'))::date;
    last_day:=(existing.data#>>'{repeat,until}')::date;
    if d<first_day or (last_day is not null and d>last_day) or (existing.data#>>'{repeat,frequency}'='none' and d<>first_day) or (existing.data#>>'{repeat,frequency}'='weekly' and not (existing.data#>'{repeat,weekdays}' @> to_jsonb(array[extract(dow from d)::int]))) then raise exception 'Occurrence does not belong to this series' using errcode='22023'; end if;
    insert into public.lifeos_calendar_exceptions(user_id,series_id,original_date,data) values(uid,sid,d,ex) on conflict(user_id,series_id,original_date) do update set data=excluded.data;
    update public.lifeos_calendar_series set version=version+1,updated_at=now() where user_id=uid and id=sid;
  else delete from public.lifeos_calendar_series where user_id=uid and id=sid; end if;
  return public.lifeos_calendar_load();
end;
$$;

revoke all on function public.lifeos_calendar_load(),public.lifeos_calendar_mutate(jsonb) from public,anon;
grant execute on function public.lifeos_calendar_load(),public.lifeos_calendar_mutate(jsonb) to authenticated;
NOTIFY pgrst, 'reload schema';


-- Task schedules and occurrence completion. Requires both earlier LifeOS migrations.
-- Additive, transactional and safe to rerun. Existing tasks are not converted.


create or replace function public.lifeos_valid_task(t jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare p jsonb; r jsonb; n record; total integer; count_done integer := 0; previous_end integer := 0; a integer; b integer; d text;
begin
  if jsonb_typeof(t) is distinct from 'object' or not (t ?& array['id','title','workspace','priority','repeat','done','due','start','focus']) then return false; end if;
  foreach d in array array['id','title','workspace','priority','repeat'] loop
    if jsonb_typeof(t->d) is distinct from 'string' then return false; end if;
  end loop;
  for d in select jsonb_object_keys(t) loop
    if d not in ('id','title','workspace','priority','repeat','done','due','start','focus','progress','completedAt','recurrenceParentId','completionMode') then return false; end if;
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
  if t ? 'completionMode' and (jsonb_typeof(t->'completionMode') is distinct from 'string' or t->>'completionMode' not in ('task','occurrence')) then return false; end if;
  if t->>'completionMode'='occurrence' and t->>'repeat'<>'None' then return false; end if;
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
  if (p->>'completed')::numeric <> count_done or (coalesce(t->>'completionMode','task') <> 'occurrence' and (t->>'done')::boolean <> (count_done = total)) then return false; end if;
  for n in select key,value from jsonb_each(p->'names') loop
    if n.key !~ '^\d+$' or n.key::integer not between 1 and total or jsonb_typeof(n.value) <> 'string' or length(n.value #>> '{}') > 120 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.lifeos_valid_calendar_block(b jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare r jsonb; day jsonb; until_day date; first_day date; k text;
begin
  if not public.lifeos_valid_calendar_details(b) or jsonb_typeof(b->'id') is distinct from 'string' or jsonb_typeof(b->'timeZone') is distinct from 'string' then return false; end if;
  perform (b->>'id')::uuid;
  for k in select jsonb_object_keys(b) loop if k not in ('id','task','workspace','start','end','timeZone','repeat','origin','retiredAt') then return false; end if; end loop;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=b->>'timeZone') then return false; end if;
  if b ? 'origin' and (jsonb_typeof(b->'origin') is distinct from 'string' or b->>'origin'<>'task') then return false; end if;
  if b ? 'retiredAt' and (jsonb_typeof(b->'retiredAt') is distinct from 'number' or (b->>'retiredAt')::numeric not between 0 and 253402300799999 or trunc((b->>'retiredAt')::numeric) <> (b->>'retiredAt')::numeric) then return false; end if;
  r := b->'repeat';
  if jsonb_typeof(r) is distinct from 'object' or not (r ?& array['frequency','weekdays','until']) or jsonb_typeof(r->'frequency') is distinct from 'string' or r->>'frequency' not in ('none','daily','weekly') or jsonb_typeof(r->'weekdays') is distinct from 'array' or jsonb_array_length(r->'weekdays') > 7 then return false; end if;
  if r->>'frequency'='weekly' and jsonb_array_length(r->'weekdays')=0 then return false; end if;
  for day in select value from jsonb_array_elements(r->'weekdays') loop if jsonb_typeof(day) is distinct from 'number' or day::text::numeric not between 0 and 6 or day::text::numeric <> trunc(day::text::numeric) then return false; end if; end loop;
  if r->'until' <> 'null'::jsonb then
    if jsonb_typeof(r->'until') is distinct from 'string' or (r->>'until') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    until_day := (r->>'until')::date;
    first_day := (to_timestamp((b->>'start')::double precision/1000) at time zone (b->>'timeZone'))::date;
    if until_day < first_day then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;


create table if not exists public.lifeos_occurrence_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null,
  original_date date not null,
  done boolean not null,
  occurrence jsonb not null check(public.lifeos_valid_calendar_details(occurrence)),
  version bigint not null default 1 check(version>0),
  primary key(user_id,series_id,original_date)
);
create table if not exists public.lifeos_schedule_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  command jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,id)
);
alter table public.lifeos_occurrence_completions enable row level security;
alter table public.lifeos_schedule_operations enable row level security;
drop policy if exists lifeos_completions_own on public.lifeos_occurrence_completions;
create policy lifeos_completions_own on public.lifeos_occurrence_completions for select to authenticated using((select auth.uid())=user_id);
revoke all on public.lifeos_occurrence_completions,public.lifeos_schedule_operations from public,anon,authenticated;
grant select on public.lifeos_occurrence_completions to authenticated;


create or replace function public.lifeos_calendar_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); zone text; blocks jsonb; exceptions jsonb; versions jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.lifeos_load();
  select time_zone into zone from public.lifeos_profiles where user_id=uid;
  select coalesce(jsonb_agg(data order by id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into blocks,versions from public.lifeos_calendar_series where user_id=uid;
  select coalesce(jsonb_agg(data),'[]'::jsonb) into exceptions from public.lifeos_calendar_exceptions where user_id=uid;
  return jsonb_build_object('timeZone',zone,'blocks',blocks,'exceptions',exceptions,'versions',versions,'taskSchedulesReady',true,'completions',(select coalesce(jsonb_agg(jsonb_build_object('seriesId',series_id,'date',original_date,'done',done,'version',version,'occurrence',occurrence)),'[]'::jsonb) from public.lifeos_occurrence_completions where user_id=uid));
end;
$$;

create or replace function public.lifeos_commit_base(p_task jsonb,p_expected_version bigint,p_successor jsonb default null) returns jsonb
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

create or replace function public.lifeos_calendar_mutate_base(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); b jsonb; ex jsonb; existing public.lifeos_calendar_series%rowtype; task_data jsonb; sid uuid; d date; first_day date; last_day date; expected bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform public.lifeos_load();
  expected := (p_command->>'expectedVersion')::bigint;
  if p_command->>'action'='save' then
    b:=p_command->'block';
    if not public.lifeos_valid_calendar_block(b) then raise exception 'Invalid planned block' using errcode='22023'; end if;
    sid:=(b->>'id')::uuid;
  elsif p_command->>'action'='exception' then
    ex:=p_command->'exception'; sid:=(ex->>'seriesId')::uuid;
    if jsonb_typeof(ex) is distinct from 'object' or not(ex ?& array['seriesId','date','cancelled']) or jsonb_typeof(ex->'cancelled') is distinct from 'boolean' or (ex->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid occurrence' using errcode='22023'; end if;
    d:=(ex->>'date')::date;
    if (ex->>'cancelled')::boolean is false and not public.lifeos_valid_calendar_details(ex->'override') then raise exception 'Invalid occurrence times' using errcode='22023'; end if;
  elsif p_command->>'action'='delete' then sid:=(p_command->>'id')::uuid;
  else raise exception 'Invalid calendar operation' using errcode='22023'; end if;
  select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid for update;
  if p_command->>'action'='save' and existing.data=b then return public.lifeos_calendar_load(); end if;
  if p_command->>'action'='delete' and existing.id is null then return public.lifeos_calendar_load(); end if;
  if p_command->>'action'='exception' and exists(select 1 from public.lifeos_calendar_exceptions where user_id=uid and series_id=sid and original_date=d and data=ex) then return public.lifeos_calendar_load(); end if;
  if (expected is null and existing.id is not null) or (expected is not null and (existing.id is null or existing.version<>expected)) or (p_command->>'action'<>'save' and expected is null) then raise exception 'Stale calendar block' using errcode='40001'; end if;
  if p_command->>'action'='save' or (p_command->>'action'='exception' and (ex->>'cancelled')::boolean is false) then
    select data into task_data from public.lifeos_tasks where user_id=uid and id=coalesce(b#>>'{task,id}',ex#>>'{override,task,id}');
    if task_data is null or task_data->>'workspace' is distinct from coalesce(b->>'workspace',ex#>>'{override,workspace}') then raise exception 'Task is unavailable' using errcode='22023'; end if;
  end if;
  if p_command->>'action'='save' then
    if existing.id is null then insert into public.lifeos_calendar_series(user_id,id,data) values(uid,sid,b);
    else update public.lifeos_calendar_series set data=b,version=version+1,updated_at=now() where user_id=uid and id=sid; end if;
  elsif p_command->>'action'='exception' then
    first_day:=(to_timestamp((existing.data->>'start')::double precision/1000) at time zone (existing.data->>'timeZone'))::date;
    last_day:=(existing.data#>>'{repeat,until}')::date;
    if d<first_day or (last_day is not null and d>last_day) or (existing.data#>>'{repeat,frequency}'='none' and d<>first_day) or (existing.data#>>'{repeat,frequency}'='weekly' and not (existing.data#>'{repeat,weekdays}' @> to_jsonb(array[extract(dow from d)::int]))) then raise exception 'Occurrence does not belong to this series' using errcode='22023'; end if;
    insert into public.lifeos_calendar_exceptions(user_id,series_id,original_date,data) values(uid,sid,d,ex) on conflict(user_id,series_id,original_date) do update set data=excluded.data;
    update public.lifeos_calendar_series set version=version+1,updated_at=now() where user_id=uid and id=sid;
  else delete from public.lifeos_calendar_series where user_id=uid and id=sid; end if;
  return public.lifeos_calendar_load();
end;
$$;


-- Resolve an occurrence from authoritative server data, including moves and cancellations.
create or replace function public.lifeos_resolve_occurrence(b jsonb,d date,v bigint) returns jsonb
language plpgsql stable set search_path='' as $$
declare zone text:=b->>'timeZone'; first_local timestamp; last_local timestamp; a numeric; e numeric; ex jsonb; result jsonb;
begin
  first_local:=to_timestamp((b->>'start')::double precision/1000) at time zone zone;
  last_local:=to_timestamp((b->>'end')::double precision/1000) at time zone zone;
  if d<first_local::date or (b#>>'{repeat,until}' is not null and d>(b#>>'{repeat,until}')::date)
    or (b#>>'{repeat,frequency}'='none' and d<>first_local::date)
    or (b#>>'{repeat,frequency}'='weekly' and not(b#>'{repeat,weekdays}' @> to_jsonb(array[extract(dow from d)::int]))) then return null; end if;
  a:=extract(epoch from ((d+first_local::time) at time zone zone))*1000;
  e:=extract(epoch from (((d+(last_local::date-first_local::date))+last_local::time) at time zone zone))*1000;
  result:=jsonb_build_object('id',(b->>'id')||'@'||d::text,'seriesId',b->>'id','date',d,'version',v,'repeating',b#>>'{repeat,frequency}'<>'none','timeZone',zone,'task',b->'task','workspace',b->'workspace','start',a,'end',e);
  select data into ex from public.lifeos_calendar_exceptions where user_id=auth.uid() and series_id=(b->>'id')::uuid and original_date=d;
  if (ex->>'cancelled')::boolean then return null; end if;
  if ex ? 'override' then result:=result||(ex->'override'); end if;
  if b ? 'retiredAt' and (result->>'start')::numeric >= (b->>'retiredAt')::numeric then return null; end if;
  if (result->>'end')::numeric <= (result->>'start')::numeric then return null; end if;
  return result;
end;
$$;

create or replace function public.lifeos_calendar_mutate(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); b jsonb; sid uuid; d date; expected bigint; existing public.lifeos_calendar_series%rowtype; previous public.lifeos_occurrence_completions%rowtype; occurrence jsonb; wanted boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_command->>'action'='complete' then
    sid:=(p_command->>'seriesId')::uuid; d:=(p_command->>'date')::date; expected:=(p_command->>'expectedVersion')::bigint;
    if jsonb_typeof(p_command->'done') is distinct from 'boolean' then raise exception 'Invalid completion' using errcode='22023'; end if;
    wanted:=(p_command->>'done')::boolean;
    select * into previous from public.lifeos_occurrence_completions where user_id=uid and series_id=sid and original_date=d for update;
    if previous.series_id is not null and previous.done=wanted then return public.lifeos_calendar_load(); end if;
    if (previous.series_id is null and expected is not null) or (previous.series_id is not null and (expected is null or previous.version<>expected)) then raise exception 'Stale occurrence completion' using errcode='40001'; end if;
    if previous.series_id is null then
      select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid;
      if existing.id is null then raise exception 'Series unavailable' using errcode='22023'; end if;
      occurrence:=public.lifeos_resolve_occurrence(existing.data,d,existing.version);
      if occurrence is null then raise exception 'Occurrence unavailable' using errcode='22023'; end if;
      insert into public.lifeos_occurrence_completions(user_id,series_id,original_date,done,occurrence) values(uid,sid,d,wanted,occurrence);
    else update public.lifeos_occurrence_completions set done=wanted,version=version+1 where user_id=uid and series_id=sid and original_date=d; end if;
    return public.lifeos_calendar_load();
  end if;
  sid:=coalesce(p_command#>>'{block,id}',p_command#>>'{exception,seriesId}',p_command->>'id')::uuid;
  select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid;
  if p_command->>'action'='save' then
    b:=p_command->'block';
    if existing.data->>'origin'='task' then
      if b->>'origin' is distinct from 'task' or b#>>'{task,id}' is distinct from existing.data#>>'{task,id}' or b->'retiredAt' is distinct from existing.data->'retiredAt' then raise exception 'Use the task editor for this schedule change' using errcode='22023'; end if;
    elsif b ? 'origin' or b ? 'retiredAt' then raise exception 'Create task schedules through the task editor' using errcode='22023'; end if;
  end if;
  if p_command->>'action'='delete' and existing.data->>'origin'='task' then
    if existing.data ? 'retiredAt' then return public.lifeos_calendar_load(); end if;
    if (p_command->>'expectedVersion')::bigint is distinct from existing.version then raise exception 'Stale schedule' using errcode='40001'; end if;
    update public.lifeos_calendar_series set data=data||jsonb_build_object('retiredAt',floor(extract(epoch from now())*1000)),version=version+1,updated_at=now() where user_id=uid and id=sid;
    return public.lifeos_calendar_load();
  end if;
  return public.lifeos_calendar_mutate_base(p_command);
end;
$$;

-- A single transaction owns task creation, schedule updates and schedule retirement.
create or replace function public.lifeos_task_schedule_save(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); t jsonb:=p_command->'task'; blocks jsonb:=p_command->'blocks'; expected jsonb:=p_command->'scheduleVersions'; op uuid:=(p_command->>'operationId')::uuid; previous_command jsonb; current_versions jsonb; b jsonb; old public.lifeos_calendar_series%rowtype; seen uuid[]:=array[]::uuid[]; task_id text:=t->>'id';
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select command into previous_command from public.lifeos_schedule_operations where user_id=uid and id=op;
  if previous_command is not null then
    if previous_command<>p_command then raise exception 'Operation identifier reused' using errcode='22023'; end if;
    return public.lifeos_load();
  end if;
  if not public.lifeos_valid_task(t) or t->>'completionMode' is distinct from 'occurrence' or t->>'repeat'<>'None' or jsonb_typeof(blocks) is distinct from 'array' or jsonb_array_length(blocks)>20 or jsonb_typeof(expected) is distinct from 'object' then raise exception 'Invalid scheduled task' using errcode='22023'; end if;
  if (t->>'done')::boolean and jsonb_array_length(blocks)>0 then raise exception 'Reopen the task before adding schedules' using errcode='22023'; end if;
  select coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into current_versions from public.lifeos_calendar_series where user_id=uid and data->>'origin'='task' and data#>>'{task,id}'=task_id and not(data ? 'retiredAt');
  if current_versions<>expected then raise exception 'Schedules changed on another device' using errcode='40001'; end if;
  perform public.lifeos_commit_base(t,(p_command->>'expectedVersion')::bigint,null);
  for b in select value from jsonb_array_elements(blocks) loop
    if not public.lifeos_valid_calendar_block(b) or b->>'origin' is distinct from 'task' or b ? 'retiredAt' or b#>>'{task,id}' is distinct from task_id or b->>'workspace' is distinct from t->>'workspace' or b#>>'{task,title}' is distinct from t->>'title' or (b->>'id')::uuid=any(seen) then raise exception 'Invalid task schedule' using errcode='22023'; end if;
    seen:=array_append(seen,(b->>'id')::uuid);
    select * into old from public.lifeos_calendar_series where user_id=uid and id=(b->>'id')::uuid;
    if old.id is not null and (old.data->>'origin' is distinct from 'task' or old.data#>>'{task,id}' is distinct from task_id or old.data ? 'retiredAt') then raise exception 'Schedule belongs elsewhere or is retired' using errcode='22023'; end if;
    perform public.lifeos_calendar_mutate_base(jsonb_build_object('action','save','block',b,'expectedVersion',expected->(b->>'id')));
  end loop;
  update public.lifeos_calendar_series set data=data||jsonb_build_object('retiredAt',floor(extract(epoch from now())*1000)),version=version+1,updated_at=now() where user_id=uid and data->>'origin'='task' and data#>>'{task,id}'=task_id and not(data ? 'retiredAt') and not(id=any(seen));
  insert into public.lifeos_schedule_operations(user_id,id,command) values(uid,op,p_command);
  return public.lifeos_load();
end;
$$;

create or replace function public.lifeos_scheduled_task_update(p_task jsonb,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select data into existing from public.lifeos_tasks where user_id=uid and id=p_task->>'id';
  if existing->>'completionMode' is distinct from 'occurrence' or p_task->>'completionMode' is distinct from 'occurrence' or p_task->>'workspace' is distinct from existing->>'workspace' then raise exception 'Use the scheduled task editor' using errcode='22023'; end if;
  if existing=p_task then return public.lifeos_load(); end if;
  perform public.lifeos_commit_base(p_task,p_expected_version,null);
  if (p_task->>'done')::boolean then
    update public.lifeos_calendar_series set data=data||jsonb_build_object('retiredAt',floor(extract(epoch from now())*1000)),version=version+1,updated_at=now() where user_id=uid and data->>'origin'='task' and data#>>'{task,id}'=p_task->>'id' and not(data ? 'retiredAt');
  end if;
  return public.lifeos_load();
end;
$$;
create or replace function public.lifeos_commit(p_task jsonb,p_expected_version bigint,p_successor jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select data into existing from public.lifeos_tasks where user_id=uid and id=p_task->>'id';
  if p_task->>'completionMode'='occurrence' or existing->>'completionMode'='occurrence' then raise exception 'Use the scheduled task operations' using errcode='22023'; end if;
  return public.lifeos_commit_base(p_task,p_expected_version,p_successor);
end;
$$;
revoke all on function public.lifeos_calendar_mutate_base(jsonb),public.lifeos_commit_base(jsonb,bigint,jsonb),public.lifeos_resolve_occurrence(jsonb,date,bigint) from public,anon,authenticated;
revoke all on function public.lifeos_task_schedule_save(jsonb),public.lifeos_scheduled_task_update(jsonb,bigint) from public,anon;
grant execute on function public.lifeos_task_schedule_save(jsonb),public.lifeos_scheduled_task_update(jsonb,bigint) to authenticated;
NOTIFY pgrst, 'reload schema';


-- Run after the LifeOS V2 backend setup. Account-specific display names; task IDs stay stable.

alter table public.lifeos_workspaces add column if not exists display_name text check(length(trim(display_name)) between 1 and 50);
alter table public.lifeos_workspaces add column if not exists version bigint not null default 1 check(version>0);
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
  return jsonb_build_object('tasks',task_data,'versions',versions,'playerName',name, 'workspaceLabels',(select jsonb_object_agg(w.name,coalesce(w.display_name,w.name)) from public.lifeos_workspaces w where w.user_id=uid), 'workspaceVersions',(select jsonb_object_agg(w.name,w.version) from public.lifeos_workspaces w where w.user_id=uid));
end;
$$;


create or replace function public.lifeos_workspace_rename(p_workspace text,p_name text,p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); existing public.lifeos_workspaces%rowtype; desired text:=trim(p_name);
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if desired is null or length(desired) not between 1 and 50 or p_expected_version is null or p_expected_version<1 then raise exception 'Invalid workspace name or version' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform public.lifeos_load();
  select * into existing from public.lifeos_workspaces where user_id=uid and name=p_workspace for update;
  if not found then raise exception 'Unknown workspace' using errcode='22023'; end if;
  if coalesce(existing.display_name,existing.name)=desired then return public.lifeos_load(); end if;
  if existing.version<>p_expected_version then raise exception 'Stale workspace' using errcode='40001'; end if;
  update public.lifeos_workspaces set display_name=desired,version=version+1 where user_id=uid and name=p_workspace;
  return public.lifeos_load();
end;
$$;
revoke all on function public.lifeos_workspace_rename(text,text,bigint) from public,anon;
grant execute on function public.lifeos_workspace_rename(text,text,bigint) to authenticated;
NOTIFY pgrst, 'reload schema';


create index if not exists lifeos_tasks_user_workspace_idx on public.lifeos_tasks(user_id,workspace);
NOTIFY pgrst, 'reload schema';
-- Calendar-only tasks. No workspace task rows are created.

create or replace function public.lifeos_valid_calendar_details(b jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(b) is distinct from 'object' or not public.lifeos_valid_calendar_task(b->'task') or b->>'workspace' not in ('University 01','University 02','Startup 01','Startup 02','Personal Growth','Calendar') or jsonb_typeof(b->'workspace') is distinct from 'string' or jsonb_typeof(b->'start') is distinct from 'number' or jsonb_typeof(b->'end') is distinct from 'number' then return false; end if;
  return (b->>'start')::numeric >= 0 and (b->>'end')::numeric > (b->>'start')::numeric and (b->>'end')::numeric <= 253402300799999 and (b->>'end')::numeric - (b->>'start')::numeric <= 604800000;
exception when others then return false;
end;
$$;

create or replace function public.lifeos_valid_calendar_block(b jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare r jsonb; day jsonb; until_day date; first_day date; k text;
begin
  if not public.lifeos_valid_calendar_details(b) or jsonb_typeof(b->'id') is distinct from 'string' or jsonb_typeof(b->'timeZone') is distinct from 'string' then return false; end if;
  perform (b->>'id')::uuid;
  for k in select jsonb_object_keys(b) loop if k not in ('id','task','workspace','start','end','timeZone','repeat','origin','retiredAt') then return false; end if; end loop;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=b->>'timeZone') then return false; end if;
  if b ? 'origin' and (jsonb_typeof(b->'origin') is distinct from 'string' or b->>'origin' not in ('task','calendar')) then return false; end if;
  if b ? 'retiredAt' and (jsonb_typeof(b->'retiredAt') is distinct from 'number' or (b->>'retiredAt')::numeric not between 0 and 253402300799999 or trunc((b->>'retiredAt')::numeric) <> (b->>'retiredAt')::numeric) then return false; end if;
  if (coalesce(b->>'origin','')='calendar') <> (b->>'workspace'='Calendar') then return false; end if;
  if b->>'origin'='calendar' and b ? 'retiredAt' then return false; end if;
  r := b->'repeat';
  if jsonb_typeof(r) is distinct from 'object' or not (r ?& array['frequency','weekdays','until']) or jsonb_typeof(r->'frequency') is distinct from 'string' or r->>'frequency' not in ('none','daily','weekly') or jsonb_typeof(r->'weekdays') is distinct from 'array' or jsonb_array_length(r->'weekdays') > 7 then return false; end if;
  if r->>'frequency'='weekly' and jsonb_array_length(r->'weekdays')=0 then return false; end if;
  for day in select value from jsonb_array_elements(r->'weekdays') loop if jsonb_typeof(day) is distinct from 'number' or day::text::numeric not between 0 and 6 or day::text::numeric <> trunc(day::text::numeric) then return false; end if; end loop;
  if r->'until' <> 'null'::jsonb then
    if jsonb_typeof(r->'until') is distinct from 'string' or (r->>'until') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
    until_day := (r->>'until')::date;
    first_day := (to_timestamp((b->>'start')::double precision/1000) at time zone (b->>'timeZone'))::date;
    if until_day < first_day then return false; end if;
  end if;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.lifeos_calendar_mutate_base(p_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); b jsonb; ex jsonb; existing public.lifeos_calendar_series%rowtype; task_data jsonb; sid uuid; d date; first_day date; last_day date; expected bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  perform public.lifeos_load();
  expected := (p_command->>'expectedVersion')::bigint;
  if p_command->>'action'='save' then
    b:=p_command->'block';
    if not public.lifeos_valid_calendar_block(b) then raise exception 'Invalid planned block' using errcode='22023'; end if;
    sid:=(b->>'id')::uuid;
  elsif p_command->>'action'='exception' then
    ex:=p_command->'exception'; sid:=(ex->>'seriesId')::uuid;
    if jsonb_typeof(ex) is distinct from 'object' or not(ex ?& array['seriesId','date','cancelled']) or jsonb_typeof(ex->'cancelled') is distinct from 'boolean' or (ex->>'date') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid occurrence' using errcode='22023'; end if;
    d:=(ex->>'date')::date;
    if (ex->>'cancelled')::boolean is false and not public.lifeos_valid_calendar_details(ex->'override') then raise exception 'Invalid occurrence times' using errcode='22023'; end if;
  elsif p_command->>'action'='delete' then sid:=(p_command->>'id')::uuid;
  else raise exception 'Invalid calendar operation' using errcode='22023'; end if;
  select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid for update;
  if p_command->>'action'='save' and existing.data=b then return public.lifeos_calendar_load(); end if;
  if p_command->>'action'='delete' and existing.id is null then return public.lifeos_calendar_load(); end if;
  if p_command->>'action'='exception' and exists(select 1 from public.lifeos_calendar_exceptions where user_id=uid and series_id=sid and original_date=d and data=ex) then return public.lifeos_calendar_load(); end if;
  if (expected is null and existing.id is not null) or (expected is not null and (existing.id is null or existing.version<>expected)) or (p_command->>'action'<>'save' and expected is null) then raise exception 'Stale calendar block' using errcode='40001'; end if;
  if p_command->>'action'='save' or (p_command->>'action'='exception' and (ex->>'cancelled')::boolean is false) then
    if coalesce(b->>'origin',existing.data->>'origin','')='calendar' then
      if coalesce(b->>'workspace',ex#>>'{override,workspace}') <> 'Calendar' then raise exception 'Invalid calendar destination' using errcode='22023'; end if;
    else
    select data into task_data from public.lifeos_tasks where user_id=uid and id=coalesce(b#>>'{task,id}',ex#>>'{override,task,id}');
    if task_data is null or task_data->>'workspace' is distinct from coalesce(b->>'workspace',ex#>>'{override,workspace}') then raise exception 'Task is unavailable' using errcode='22023'; end if;
    end if;
  end if;
  if p_command->>'action'='save' then
    if existing.id is null then insert into public.lifeos_calendar_series(user_id,id,data) values(uid,sid,b);
    else update public.lifeos_calendar_series set data=b,version=version+1,updated_at=now() where user_id=uid and id=sid; end if;
  elsif p_command->>'action'='exception' then
    first_day:=(to_timestamp((existing.data->>'start')::double precision/1000) at time zone (existing.data->>'timeZone'))::date;
    last_day:=(existing.data#>>'{repeat,until}')::date;
    if d<first_day or (last_day is not null and d>last_day) or (existing.data#>>'{repeat,frequency}'='none' and d<>first_day) or (existing.data#>>'{repeat,frequency}'='weekly' and not (existing.data#>'{repeat,weekdays}' @> to_jsonb(array[extract(dow from d)::int]))) then raise exception 'Occurrence does not belong to this series' using errcode='22023'; end if;
    insert into public.lifeos_calendar_exceptions(user_id,series_id,original_date,data) values(uid,sid,d,ex) on conflict(user_id,series_id,original_date) do update set data=excluded.data;
    update public.lifeos_calendar_series set version=version+1,updated_at=now() where user_id=uid and id=sid;
  else delete from public.lifeos_calendar_series where user_id=uid and id=sid; end if;
  return public.lifeos_calendar_load();
end;
$$;

create or replace function public.lifeos_calendar_mutate(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); b jsonb; sid uuid; d date; expected bigint; existing public.lifeos_calendar_series%rowtype; previous public.lifeos_occurrence_completions%rowtype; occurrence jsonb; wanted boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if p_command->>'action'='complete' then
    sid:=(p_command->>'seriesId')::uuid; d:=(p_command->>'date')::date; expected:=(p_command->>'expectedVersion')::bigint;
    if jsonb_typeof(p_command->'done') is distinct from 'boolean' then raise exception 'Invalid completion' using errcode='22023'; end if;
    wanted:=(p_command->>'done')::boolean;
    select * into previous from public.lifeos_occurrence_completions where user_id=uid and series_id=sid and original_date=d for update;
    if previous.series_id is not null and previous.done=wanted then return public.lifeos_calendar_load(); end if;
    if (previous.series_id is null and expected is not null) or (previous.series_id is not null and (expected is null or previous.version<>expected)) then raise exception 'Stale occurrence completion' using errcode='40001'; end if;
    if previous.series_id is null then
      select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid;
      if existing.id is null then raise exception 'Series unavailable' using errcode='22023'; end if;
      occurrence:=public.lifeos_resolve_occurrence(existing.data,d,existing.version);
      if occurrence is null then raise exception 'Occurrence unavailable' using errcode='22023'; end if;
      insert into public.lifeos_occurrence_completions(user_id,series_id,original_date,done,occurrence) values(uid,sid,d,wanted,occurrence);
    else update public.lifeos_occurrence_completions set done=wanted,version=version+1 where user_id=uid and series_id=sid and original_date=d; end if;
    return public.lifeos_calendar_load();
  end if;
  sid:=coalesce(p_command#>>'{block,id}',p_command#>>'{exception,seriesId}',p_command->>'id')::uuid;
  select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid;
  if p_command->>'action'='save' then
    b:=p_command->'block';
    if existing.data->>'origin'='task' then
      if b->>'origin' is distinct from 'task' or b#>>'{task,id}' is distinct from existing.data#>>'{task,id}' or b->'retiredAt' is distinct from existing.data->'retiredAt' then raise exception 'Use the task editor for this schedule change' using errcode='22023'; end if;
    elsif b->>'origin'='calendar' then
      if b ? 'retiredAt' or (existing.id is not null and existing.data->>'origin' is distinct from 'calendar') then raise exception 'Cannot convert a linked plan' using errcode='22023'; end if;
    elsif existing.data->>'origin'='calendar' then raise exception 'Cannot convert a calendar-only plan' using errcode='22023';
    elsif b ? 'origin' or b ? 'retiredAt' then raise exception 'Create task schedules through the task editor' using errcode='22023'; end if;
  end if;
  if p_command->>'action'='delete' and existing.data->>'origin'='task' then
    if existing.data ? 'retiredAt' then return public.lifeos_calendar_load(); end if;
    if (p_command->>'expectedVersion')::bigint is distinct from existing.version then raise exception 'Stale schedule' using errcode='40001'; end if;
    update public.lifeos_calendar_series set data=data||jsonb_build_object('retiredAt',floor(extract(epoch from now())*1000)),version=version+1,updated_at=now() where user_id=uid and id=sid;
    return public.lifeos_calendar_load();
  end if;
  return public.lifeos_calendar_mutate_base(p_command);
end;
$$;

create or replace function public.lifeos_calendar_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); zone text; blocks jsonb; exceptions jsonb; versions jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.lifeos_load();
  select time_zone into zone from public.lifeos_profiles where user_id=uid;
  select coalesce(jsonb_agg(data order by id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into blocks,versions from public.lifeos_calendar_series where user_id=uid;
  select coalesce(jsonb_agg(data),'[]'::jsonb) into exceptions from public.lifeos_calendar_exceptions where user_id=uid;
  return jsonb_build_object('timeZone',zone,'blocks',blocks,'exceptions',exceptions,'versions',versions,'standaloneReady',true,'taskSchedulesReady',true,'completions',(select coalesce(jsonb_agg(jsonb_build_object('seriesId',series_id,'date',original_date,'done',done,'version',version,'occurrence',occurrence)),'[]'::jsonb) from public.lifeos_occurrence_completions where user_id=uid));
end;
$$;

notify pgrst, 'reload schema';
commit;
