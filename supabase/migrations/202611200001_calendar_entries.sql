-- Calendar-only tasks: run after the V2 backend setup. No workspace task rows are created.
begin;

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
