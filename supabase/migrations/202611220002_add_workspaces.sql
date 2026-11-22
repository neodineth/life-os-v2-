-- Add named workspaces without changing existing workspace/task IDs.
-- Run after the existing LifeOS V2 backend setup. Transactional and rerunnable.
begin;
create or replace function public.lifeos_valid_workspace_id(w text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(w in ('University 01','University 02','Startup 01','Startup 02','Personal Growth') or w ~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false);
$$;
alter table public.lifeos_workspaces drop constraint if exists lifeos_workspaces_name_check;
alter table public.lifeos_workspaces add constraint lifeos_workspaces_name_check check(public.lifeos_valid_workspace_id(name));
alter table public.lifeos_workspaces add column if not exists display_name text check(length(trim(display_name)) between 1 and 50);
alter table public.lifeos_workspaces add column if not exists version bigint not null default 1 check(version>0);
alter table public.lifeos_workspaces add column if not exists created_at timestamptz not null default now();
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
  if not public.lifeos_valid_workspace_id(t->>'workspace') then return false; end if;
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
create or replace function public.lifeos_valid_calendar_details(b jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(b) is distinct from 'object' or not public.lifeos_valid_calendar_task(b->'task') or (not public.lifeos_valid_workspace_id(b->>'workspace') and b->>'workspace'<>'Calendar') or jsonb_typeof(b->'workspace') is distinct from 'string' or jsonb_typeof(b->'start') is distinct from 'number' or jsonb_typeof(b->'end') is distinct from 'number' then return false; end if;
  return (b->>'start')::numeric >= 0 and (b->>'end')::numeric > (b->>'start')::numeric and (b->>'end')::numeric <= 253402300799999 and (b->>'end')::numeric - (b->>'start')::numeric <= 604800000;
exception when others then return false;
end;
$$;
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
  return jsonb_build_object('workspaceCreateReady',true,'workspaceIds',(select jsonb_agg(w.name order by case w.name when 'University 01' then 0 when 'University 02' then 1 when 'Startup 01' then 2 when 'Startup 02' then 3 when 'Personal Growth' then 4 else 5 end,w.created_at,w.name) from public.lifeos_workspaces w where w.user_id=uid),'tasks',task_data,'versions',versions,'playerName',name, 'workspaceLabels',(select jsonb_object_agg(w.name,coalesce(w.display_name,w.name)) from public.lifeos_workspaces w where w.user_id=uid), 'workspaceVersions',(select jsonb_object_agg(w.name,w.version) from public.lifeos_workspaces w where w.user_id=uid));
end;
$$;

create or replace function public.lifeos_workspace_create(p_workspace text,p_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); desired text:=trim(p_name); existing public.lifeos_workspaces%rowtype;
begin
 if uid is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_workspace is null or p_workspace !~ '^custom:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or desired is null or length(desired) not between 1 and 50 then raise exception 'Invalid workspace' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 perform public.lifeos_load();
 select * into existing from public.lifeos_workspaces where user_id=uid and name=p_workspace;
 if found then
  if existing.display_name=desired then return public.lifeos_load(); end if;
  raise exception 'Workspace already changed' using errcode='40001';
 end if;
 if exists(select 1 from public.lifeos_workspaces w where w.user_id=uid and lower(coalesce(w.display_name,w.name))=lower(desired)) then raise exception 'Workspace name already exists' using errcode='22023'; end if;
 insert into public.lifeos_workspaces(user_id,name,display_name) values(uid,p_workspace,desired);
 return public.lifeos_load();
end;
$$;
revoke all on function public.lifeos_workspace_create(text,text) from public,anon;
grant execute on function public.lifeos_workspace_create(text,text) to authenticated;
NOTIFY pgrst,'reload schema';
commit;
