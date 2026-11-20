-- Run after LifeOS V2 calendar and task-schedule setup.
begin;
create or replace function public.lifeos_calendar_delete_scoped(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; d date; scope text; expected bigint; existing public.lifeos_calendar_series%rowtype; first_day date; until_day date;
begin
  if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_command) is distinct from 'object' or p_command->>'action' is distinct from 'delete-scoped'
    or not(p_command ?& array['id','date','scope','expectedVersion'])
    or jsonb_typeof(p_command->'scope') is distinct from 'string'
    or p_command->>'scope' not in ('occurrence','following','series')
    or jsonb_typeof(p_command->'date') is distinct from 'string' or p_command->>'date' !~ '^\d{4}-\d{2}-\d{2}$'
    or jsonb_typeof(p_command->'expectedVersion') is distinct from 'number' then raise exception 'Invalid deletion' using errcode='22023'; end if;
  sid:=(p_command->>'id')::uuid; d:=(p_command->>'date')::date; scope:=p_command->>'scope'; expected:=(p_command->>'expectedVersion')::bigint;
  if expected<1 or expected::numeric<>(p_command->>'expectedVersion')::numeric then raise exception 'Invalid version' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select * into existing from public.lifeos_calendar_series where user_id=uid and id=sid for update;
  -- Repeating an already-applied deletion is safe, including a lost response.
  if existing.id is null then return public.lifeos_calendar_load(); end if;
  if scope='occurrence' and exists(select 1 from public.lifeos_calendar_exceptions where user_id=uid and series_id=sid and original_date=d and data->>'cancelled'='true') then return public.lifeos_calendar_load(); end if;
  until_day:=(existing.data#>>'{repeat,until}')::date;
  if scope='following' and until_day is not null and until_day<d then return public.lifeos_calendar_load(); end if;
  if existing.version<>expected then raise exception 'Stale calendar block' using errcode='40001'; end if;
  if public.lifeos_resolve_occurrence(existing.data,d,existing.version) is null then raise exception 'Occurrence unavailable' using errcode='22023'; end if;
  first_day:=(to_timestamp((existing.data->>'start')::double precision/1000) at time zone (existing.data->>'timeZone'))::date;
  if scope='series' or (scope='following' and d=first_day) then
    delete from public.lifeos_calendar_series where user_id=uid and id=sid;
  elsif scope='following' then
    -- Use original recurrence dates, even if this occurrence was moved.
    update public.lifeos_calendar_series set data=jsonb_set(data,'{repeat,until}',to_jsonb((d-1)::text)),version=version+1,updated_at=now() where user_id=uid and id=sid;
  else
    insert into public.lifeos_calendar_exceptions(user_id,series_id,original_date,data)
    values(uid,sid,d,jsonb_build_object('seriesId',sid,'date',d,'cancelled',true))
    on conflict(user_id,series_id,original_date) do update set data=excluded.data;
    update public.lifeos_calendar_series set version=version+1,updated_at=now() where user_id=uid and id=sid;
  end if;
  -- Completion snapshots and the parent workspace task are intentionally retained.
  return public.lifeos_calendar_load();
end;
$$;
revoke all on function public.lifeos_calendar_delete_scoped(jsonb) from public,anon;
grant execute on function public.lifeos_calendar_delete_scoped(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
