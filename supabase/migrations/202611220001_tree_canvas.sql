BEGIN;
CREATE TABLE IF NOT EXISTS public.lifeos_trees (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 document jsonb NOT NULL, version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 mutation_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lifeos_trees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lifeos_tree_read ON public.lifeos_trees;
CREATE POLICY lifeos_tree_read ON public.lifeos_trees FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.lifeos_trees FROM anon,authenticated;
GRANT SELECT ON public.lifeos_trees TO authenticated;
CREATE OR REPLACE FUNCTION public.lifeos_tree_valid(d jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE n jsonb; child jsonb; ids text[]='{}'; visited text[]='{}'; queue text[]; depths int[]; current_id text; depth int; child_node jsonb; root_count int=0;
BEGIN
 IF jsonb_typeof(d)<>'object' OR d->>'format'<>'1' OR jsonb_typeof(d->'nodes')<>'array' OR NOT(d ?& ARRAY['format','rootId','nodes']) OR (SELECT count(*) FROM jsonb_object_keys(d))<>3 THEN RETURN false; END IF;
 IF jsonb_array_length(d->'nodes') NOT BETWEEN 1 AND 1000 OR octet_length(d::text)>10000000 THEN RETURN false; END IF;
 PERFORM (d->>'rootId')::uuid;
 FOR n IN SELECT value FROM jsonb_array_elements(d->'nodes') LOOP
  IF NOT(n ?& ARRAY['id','parentId','children','name','notes','collapsed']) OR (SELECT count(*) FROM jsonb_object_keys(n))<>6 THEN RETURN false; END IF;
  PERFORM (n->>'id')::uuid;
  IF n->>'id'=ANY(ids) THEN RETURN false; END IF; ids=array_append(ids,n->>'id');
  IF jsonb_typeof(n->'name')<>'string' OR length(btrim(n->>'name')) NOT BETWEEN 1 AND 120 OR jsonb_typeof(n->'notes')<>'string' OR length(n->>'notes')>20000 OR jsonb_typeof(n->'collapsed')<>'boolean' OR jsonb_typeof(n->'children')<>'array' THEN RETURN false; END IF;
  IF n->'parentId'='null'::jsonb THEN root_count=root_count+1; IF n->>'id'<>d->>'rootId' THEN RETURN false; END IF; ELSE PERFORM (n->>'parentId')::uuid; END IF;
 END LOOP;
 IF root_count<>1 THEN RETURN false; END IF;
 queue=ARRAY[d->>'rootId'];depths=ARRAY[1];
 WHILE cardinality(queue)>0 LOOP
  current_id=queue[1];depth=depths[1];queue=queue[2:];depths=depths[2:];
  IF current_id=ANY(visited) OR depth>30 THEN RETURN false; END IF;
  visited=array_append(visited,current_id);
  SELECT value INTO n FROM jsonb_array_elements(d->'nodes') WHERE value->>'id'=current_id;
  IF n IS NULL THEN RETURN false; END IF;
  FOR child IN SELECT value FROM jsonb_array_elements(n->'children') LOOP
   SELECT value INTO child_node FROM jsonb_array_elements(d->'nodes') WHERE value->>'id'=child#>>'{}';
   IF child_node IS NULL OR child_node->>'parentId'<>current_id THEN RETURN false; END IF;
   queue=array_append(queue,child#>>'{}');depths=array_append(depths,depth+1);
  END LOOP;
 END LOOP;
 RETURN cardinality(visited)=cardinality(ids);
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;
CREATE OR REPLACE FUNCTION public.lifeos_tree_load() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('document',document,'version',version) INTO result FROM public.lifeos_trees WHERE user_id=auth.uid();
 RETURN coalesce(result,jsonb_build_object('document',NULL,'version',0));
END; $$;
CREATE OR REPLACE FUNCTION public.lifeos_tree_save(p_document jsonb,p_expected_version bigint,p_mutation_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_row public.lifeos_trees;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_document IS NULL OR NOT public.lifeos_tree_valid(p_document) OR p_expected_version IS NULL OR p_expected_version<0 OR p_mutation_id IS NULL THEN RAISE EXCEPTION 'Invalid tree' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('lifeos-tree:'||auth.uid()::text,0));
 SELECT * INTO current_row FROM public.lifeos_trees WHERE user_id=auth.uid();
 IF current_row.mutation_id=p_mutation_id AND current_row.document=p_document THEN RETURN public.lifeos_tree_load(); END IF;
 IF coalesce(current_row.version,0)<>p_expected_version THEN RAISE EXCEPTION 'Tree changed on another device' USING ERRCODE='40001'; END IF;
 INSERT INTO public.lifeos_trees(user_id,document,version,mutation_id) VALUES(auth.uid(),p_document,1,p_mutation_id)
 ON CONFLICT(user_id) DO UPDATE SET document=excluded.document,version=lifeos_trees.version+1,mutation_id=excluded.mutation_id,updated_at=now();
 RETURN public.lifeos_tree_load();
END; $$;
REVOKE ALL ON FUNCTION public.lifeos_tree_valid(jsonb),public.lifeos_tree_load(),public.lifeos_tree_save(jsonb,bigint,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lifeos_tree_load(),public.lifeos_tree_save(jsonb,bigint,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
