-- Calendar occurrence outcomes and progress notes. Run after the V2 calendar setup.
begin;
alter table public.lifeos_occurrence_completions add column if not exists status text not null default 'pending' check(status in ('pending','completed','partial','could_not_complete'));
alter table public.lifeos_occurrence_completions add column if not exists notes text not null default '' check(length(notes)<=10000);
update public.lifeos_occurrence_completions set status='completed' where done and status='pending';
create or replace function public.lifeos_calendar_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=auth.uid(); zone text; blocks jsonb; exceptions jsonb; versions jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.lifeos_load();
  select time_zone into zone from public.lifeos_profiles where user_id=uid;
  select coalesce(jsonb_agg(data order by id),'[]'::jsonb),coalesce(jsonb_object_agg(id,version),'{}'::jsonb) into blocks,versions from public.lifeos_calendar_series where user_id=uid;
  select coalesce(jsonb_agg(data),'[]'::jsonb) into exceptions from public.lifeos_calendar_exceptions where user_id=uid;
  return jsonb_build_object('timeZone',zone,'blocks',blocks,'exceptions',exceptions,'versions',versions,'progressReady',true,'standaloneReady',true,'taskSchedulesReady',true,'completions',(select coalesce(jsonb_agg(jsonb_build_object('seriesId',series_id,'date',original_date,'done',done,'status',case when done then 'completed' when status='completed' then 'pending' else status end,'notes',notes,'version',version,'occurrence',occurrence)),'[]'::jsonb) from public.lifeos_occurrence_completions where user_id=uid));
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
      insert into public.lifeos_occurrence_completions(user_id,series_id,original_date,done,occurrence,status) values(uid,sid,d,wanted,occurrence,case when wanted then 'completed' else 'pending' end);
    else update public.lifeos_occurrence_completions set done=wanted,status=case when wanted then 'completed' else 'pending' end,version=version+1 where user_id=uid and series_id=sid and original_date=d; end if;
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

create or replace function public.lifeos_calendar_progress_save(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; d date; wanted text; note_text text; expected bigint; series_version bigint; existing public.lifeos_occurrence_completions%rowtype; series public.lifeos_calendar_series%rowtype; snapshot jsonb;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' or p_command->>'action' is distinct from 'progress'
    or not(p_command ?& array['seriesId','date','status','notes','expectedVersion','expectedSeriesVersion'])
    or jsonb_typeof(p_command->'status') is distinct from 'string' or p_command->>'status' not in ('pending','completed','partial','could_not_complete')
    or jsonb_typeof(p_command->'notes') is distinct from 'string' or length(p_command->>'notes')>10000
    or jsonb_typeof(p_command->'date') is distinct from 'string' or p_command->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_command->'expectedSeriesVersion') is distinct from 'number'
    or jsonb_typeof(p_command->'expectedVersion') not in ('null','number') then raise exception 'Invalid progress details' using errcode='22023'; end if;
  sid:=(p_command->>'seriesId')::uuid; d:=(p_command->>'date')::date; wanted:=p_command->>'status'; note_text:=p_command->>'notes'; expected:=(p_command->>'expectedVersion')::bigint; series_version:=(p_command->>'expectedSeriesVersion')::bigint;
  if series_version<1 or series_version::numeric<>(p_command->>'expectedSeriesVersion')::numeric or (expected is not null and (expected<1 or expected::numeric<>(p_command->>'expectedVersion')::numeric)) then raise exception 'Invalid version' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into existing from public.lifeos_occurrence_completions where user_id=uid and series_id=sid and original_date=d for update;
  if existing.series_id is not null and existing.status=wanted and existing.done=(wanted='completed') and existing.notes=note_text then return public.lifeos_calendar_load(); end if;
  if (existing.series_id is null and expected is not null) or (existing.series_id is not null and existing.version is distinct from expected) then raise exception 'Stale occurrence progress' using errcode='40001'; end if;
  select * into series from public.lifeos_calendar_series where user_id=uid and id=sid;
  if series.id is not null and series.version<>series_version then raise exception 'Stale calendar block' using errcode='40001'; end if;
  if existing.done then snapshot:=existing.occurrence;
  elsif series.id is not null then snapshot:=public.lifeos_resolve_occurrence(series.data,d,series.version); end if;
  snapshot:=coalesce(snapshot,existing.occurrence);
  if snapshot is null then raise exception 'Occurrence unavailable' using errcode='22023'; end if;
  if existing.series_id is null then
    insert into public.lifeos_occurrence_completions(user_id,series_id,original_date,done,status,notes,occurrence) values(uid,sid,d,wanted='completed',wanted,note_text,snapshot);
  else
    update public.lifeos_occurrence_completions set done=wanted='completed',status=wanted,notes=note_text,occurrence=snapshot,version=version+1 where user_id=uid and series_id=sid and original_date=d;
  end if;
  return public.lifeos_calendar_load();
end;
$$;
revoke all on function public.lifeos_calendar_progress_save(jsonb) from public,anon;
grant execute on function public.lifeos_calendar_progress_save(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
