-- Run after the LifeOS V2 backend setup. Account-specific display names; task IDs stay stable.
begin;
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
commit;
