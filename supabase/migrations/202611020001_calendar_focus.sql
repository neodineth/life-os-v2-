begin;

create or replace function public.lifeos_valid_focus_task(t jsonb) returns boolean
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

create or replace function public.lifeos_valid_focus_record(s jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; previous_end numeric; first_at numeric; last_at numeric; a numeric; b numeric; k text;
begin
  if jsonb_typeof(s) is distinct from 'object' or not (s ?& array['id','tasks','startedAt','endedAt','segments','interrupted']) then return false; end if;
  for k in select jsonb_object_keys(s) loop if k not in ('id','tasks','startedAt','endedAt','segments','interrupted','plannedOccurrenceId') then return false; end if; end loop;
  if jsonb_typeof(s->'id') is distinct from 'string' or length(s->>'id') not between 1 and 160 or jsonb_typeof(s->'interrupted') is distinct from 'boolean' then return false; end if;
  if s ? 'plannedOccurrenceId' and (jsonb_typeof(s->'plannedOccurrenceId') is distinct from 'string' or length(s->>'plannedOccurrenceId') > 200) then return false; end if;
  if jsonb_typeof(s->'startedAt') is distinct from 'number' or jsonb_typeof(s->'endedAt') is distinct from 'number' then return false; end if;
  first_at := (s->>'startedAt')::numeric; last_at := (s->>'endedAt')::numeric;
  if first_at < 0 or last_at < first_at or last_at > 253402300799999 then return false; end if;
  if jsonb_typeof(s->'tasks') is distinct from 'array' or jsonb_array_length(s->'tasks') not between 1 and 10000 or jsonb_typeof(s->'segments') is distinct from 'array' then return false; end if;
  for item in select value from jsonb_array_elements(s->'tasks') loop if not public.lifeos_valid_focus_task(item) then return false; end if; end loop;
  previous_end := first_at;
  for item in select value from jsonb_array_elements(s->'segments') loop
    if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['state','start','end']) or jsonb_typeof(item->'state') is distinct from 'string' or item->>'state' not in ('focus','away','paused','untracked') or jsonb_typeof(item->'start') is distinct from 'number' or jsonb_typeof(item->'end') is distinct from 'number' then return false; end if;
    a := (item->>'start')::numeric; b := (item->>'end')::numeric;
    if a < previous_end or b < a or b > last_at then return false; end if;
    previous_end := b;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.lifeos_valid_calendar_details(b jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(b) is distinct from 'object' or not public.lifeos_valid_focus_task(b->'task') or b->>'workspace' not in ('University 01','University 02','Startup 01','Startup 02','Personal Growth') or jsonb_typeof(b->'workspace') is distinct from 'string' or jsonb_typeof(b->'start') is distinct from 'number' or jsonb_typeof(b->'end') is distinct from 'number' then return false; end if;
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
create table if not exists public.lifeos_focus_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null check(public.lifeos_valid_focus_record(data)) check(data->>'id'=id),
  version bigint not null default 1 check(version>0),
  updated_at timestamptz not null default now(),
  primary key(user_id,id)
);
create index if not exists lifeos_focus_start on public.lifeos_focus_sessions(user_id,((data->>'startedAt')::numeric));

alter table public.lifeos_calendar_series enable row level security;
alter table public.lifeos_calendar_exceptions enable row level security;
alter table public.lifeos_focus_sessions enable row level security;
drop policy if exists lifeos_calendar_own on public.lifeos_calendar_series;
create policy lifeos_calendar_own on public.lifeos_calendar_series for select to authenticated using((select auth.uid())=user_id);
drop policy if exists lifeos_exceptions_own on public.lifeos_calendar_exceptions;
create policy lifeos_exceptions_own on public.lifeos_calendar_exceptions for select to authenticated using((select auth.uid())=user_id);
drop policy if exists lifeos_focus_own on public.lifeos_focus_sessions;
create policy lifeos_focus_own on public.lifeos_focus_sessions for select to authenticated using((select auth.uid())=user_id);
revoke all on public.lifeos_calendar_series,public.lifeos_calendar_exceptions,public.lifeos_focus_sessions from anon,authenticated;
grant select on public.lifeos_calendar_series,public.lifeos_calendar_exceptions,public.lifeos_focus_sessions to authenticated;

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

create or replace function public.lifeos_focus_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); records jsonb; versions jsonb; zone text;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.lifeos_load();
  select time_zone into zone from public.lifeos_profiles where user_id=uid;
  select coalesce(jsonb_agg(data order by (data->>'startedAt')::numeric,id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into records,versions from public.lifeos_focus_sessions where user_id=uid;
  return jsonb_build_object('records',records,'versions',versions,'timeZone',zone);
end;
$$;

create or replace function public.lifeos_focus_save(p_record jsonb,p_expected_version bigint default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); existing public.lifeos_focus_sessions%rowtype; result_version bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.lifeos_valid_focus_record(p_record) then raise exception 'Invalid focus session' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into existing from public.lifeos_focus_sessions where user_id=uid and id=p_record->>'id' for update;
  if existing.id is not null then
    if existing.data=p_record or (existing.data->>'interrupted')::boolean is false or (p_record->>'endedAt')::numeric < (existing.data->>'endedAt')::numeric then return jsonb_build_object('record',existing.data,'version',existing.version); end if;
    if p_record->'startedAt' is distinct from existing.data->'startedAt' or p_record->'tasks' is distinct from existing.data->'tasks' or p_record->'plannedOccurrenceId' is distinct from existing.data->'plannedOccurrenceId' then raise exception 'Session identity changed' using errcode='22023'; end if;
    if p_expected_version is null or p_expected_version<>existing.version then raise exception 'Stale focus checkpoint' using errcode='40001'; end if;
    update public.lifeos_focus_sessions set data=p_record,version=version+1,updated_at=now() where user_id=uid and id=existing.id returning version into result_version;
  else
    if p_expected_version is not null then raise exception 'Missing focus session' using errcode='40001'; end if;
    insert into public.lifeos_focus_sessions(user_id,id,data) values(uid,p_record->>'id',p_record) returning version into result_version;
  end if;
  return jsonb_build_object('record',p_record,'version',result_version);
end;
$$;

create or replace function public.lifeos_focus_import(p_records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); r jsonb; v bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>50 then raise exception 'Import at most fifty sessions per batch' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  for r in select value from jsonb_array_elements(p_records) loop
    select version into v from public.lifeos_focus_sessions where user_id=uid and id=r->>'id';
    perform public.lifeos_focus_save(r,v);
  end loop;
  return public.lifeos_focus_load();
end;
$$;

revoke all on function public.lifeos_calendar_load(),public.lifeos_calendar_mutate(jsonb),public.lifeos_focus_load(),public.lifeos_focus_save(jsonb,bigint),public.lifeos_focus_import(jsonb) from public,anon;
grant execute on function public.lifeos_calendar_load(),public.lifeos_calendar_mutate(jsonb),public.lifeos_focus_load(),public.lifeos_focus_save(jsonb,bigint),public.lifeos_focus_import(jsonb) to authenticated;
commit;
