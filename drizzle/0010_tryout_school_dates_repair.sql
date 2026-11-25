-- =============================================================================
-- Repair of the 0009 backfill.
--
-- 0009 matched a merged twin's blueprint upload to a school by the batch's
-- school_id. Twins uploaded by Super Admin have no school_id, but their
-- options name the participants (newTryout.schoolIds). A blueprint upload
-- for exactly one school therefore gives that school's original sitting date.
-- =============================================================================

update public.tryout_schools ts
   set date = x.date
  from (
    select distinct on (b.tryout_id, (b.mapping_json -> 'options' -> 'newTryout' -> 'schoolIds' ->> 0))
           b.tryout_id,
           (b.mapping_json -> 'options' -> 'newTryout' -> 'schoolIds' ->> 0)::uuid as school_id,
           (b.mapping_json -> 'options' -> 'newTryout' ->> 'date')::date as date
      from public.import_batches b
     where b.type = 'tryout_blueprint'
       and b.school_id is null
       and jsonb_typeof(b.mapping_json -> 'options' -> 'newTryout' -> 'schoolIds') = 'array'
       and jsonb_array_length(b.mapping_json -> 'options' -> 'newTryout' -> 'schoolIds') = 1
       and b.mapping_json -> 'options' -> 'newTryout' ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$'
     order by b.tryout_id, (b.mapping_json -> 'options' -> 'newTryout' -> 'schoolIds' ->> 0), b.created_at
  ) x
 where ts.tryout_id = x.tryout_id and ts.school_id = x.school_id;
