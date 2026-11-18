-- Read-only verification after running LifeOS-V2-Backend-Setup.sql.
select name as table_name, to_regclass('public.' || name) is not null as exists,
  coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.' || name)),false) as row_security_enabled
from unnest(array['lifeos_profiles','lifeos_workspaces','lifeos_tasks','lifeos_imports','lifeos_calendar_series','lifeos_calendar_exceptions','lifeos_occurrence_completions']) as name;
select signature, to_regprocedure(signature) is not null as exists
from unnest(array[
'public.lifeos_load()',
'public.lifeos_commit(jsonb,bigint,jsonb)',
'public.lifeos_delete(text,bigint)',
'public.lifeos_import(jsonb)',
'public.lifeos_calendar_load()',
'public.lifeos_calendar_mutate(jsonb)',
'public.lifeos_task_schedule_save(jsonb)',
'public.lifeos_scheduled_task_update(jsonb,bigint)'
]) as signature;
select to_regclass('public.lifeos_focus_sessions') is null as no_focus_session_table,
       to_regprocedure('public.lifeos_focus_save(jsonb,bigint)') is null as no_focus_upload_function;
