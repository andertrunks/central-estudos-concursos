-- PR-4 SYNC WRITER — backend-only CAS + durable mutation receipts.
-- This migration is exercised only in disposable/local Supabase during PR-4.
-- It does not enable cloudMode and it grants no browser write privilege.

create extension if not exists pgcrypto with schema extensions;

alter table public.central_study_records
  add column if not exists last_mutation_id uuid null;

alter table public.central_sync_mutations
  add column if not exists operation text null,
  add column if not exists current_revision bigint null,
  add column if not exists current_payload_hash text null,
  add column if not exists current_deleted boolean null;

alter table public.central_sync_mutations
  add constraint central_sync_mutations_operation_check
    check (operation is null or operation in ('upsert', 'delete')),
  add constraint central_sync_mutations_current_revision_check
    check (current_revision is null or current_revision >= 0),
  add constraint central_sync_mutations_current_payload_hash_check
    check (
      current_payload_hash is null
      or current_payload_hash ~ '^sha256:[0-9a-f]{64}$'
    );

create or replace function public.central_cloud_canonical_jsonb(p_value jsonb)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_type text;
  v_result text;
begin
  if p_value is null then
    return 'null';
  end if;
  v_type := jsonb_typeof(p_value);
  if v_type = 'object' then
    select '{' || coalesce(
      string_agg(to_jsonb(key)::text || ':' || public.central_cloud_canonical_jsonb(value), ',' order by key),
      ''
    ) || '}'
      into v_result
      from jsonb_each(p_value);
    return v_result;
  elsif v_type = 'array' then
    select '[' || coalesce(
      string_agg(public.central_cloud_canonical_jsonb(value), ',' order by ordinality),
      ''
    ) || ']'
      into v_result
      from jsonb_array_elements(p_value) with ordinality as items(value, ordinality);
    return v_result;
  end if;
  return p_value::text;
end;
$$;

create or replace function public.central_cloud_hash(p_value jsonb)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  select 'sha256:' || encode(
    extensions.digest(convert_to(public.central_cloud_canonical_jsonb(p_value), 'UTF8'), 'sha256'),
    'hex'
  )
$$;

create or replace function public.central_cloud_request_hash(
  p_mutation_id uuid,
  p_entity_kind text,
  p_entity_id text,
  p_operation text,
  p_schema_version smallint,
  p_base_revision bigint,
  p_payload_hash text
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog, public, extensions
as $$
  select public.central_cloud_hash(jsonb_build_object(
    'baseRevision', p_base_revision,
    'entityId', p_entity_id,
    'entityKind', p_entity_kind,
    'mutationId', p_mutation_id::text,
    'operation', p_operation,
    'payloadHash', p_payload_hash,
    'schemaVersion', p_schema_version
  ))
$$;

create or replace function public.central_apply_cloud_mutations(
  p_user_id uuid,
  p_mutations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, extensions
as $$
declare
  v_item jsonb;
  v_mutation_id uuid;
  v_kind text;
  v_entity_id text;
  v_operation text;
  v_schema_version smallint;
  v_base_revision bigint;
  v_payload jsonb;
  v_payload_hash text;
  v_request_hash text;
  v_expected_payload_hash text;
  v_expected_request_hash text;
  v_receipt public.central_sync_mutations%rowtype;
  v_record public.central_study_records%rowtype;
  v_record_exists boolean;
  v_revision bigint;
  v_change_seq bigint;
  v_state_hash text;
  v_results jsonb := '[]'::jsonb;
  v_current_revision bigint;
  v_current_payload_hash text;
  v_current_deleted boolean;
begin
  if p_user_id is null then
    raise exception 'INVALID_USER' using errcode = '22023';
  end if;
  if jsonb_typeof(p_mutations) <> 'array' then
    raise exception 'INVALID_MUTATION_BATCH' using errcode = '22023';
  end if;
  if jsonb_array_length(p_mutations) < 1 or jsonb_array_length(p_mutations) > 50 then
    raise exception 'INVALID_MUTATION_BATCH_SIZE' using errcode = '22023';
  end if;

  -- Serialize writer calls for one account. This closes the race where two tabs
-- can observe the same missing receipt/current revision before either commits.
-- The lock is transaction-scoped and does not block writes for other accounts.
perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('central-cloud-sync:' || p_user_id::text, 0)
);

  -- Pass 1: validate the complete request before any side effect.
  for v_item in select value from jsonb_array_elements(p_mutations)
  loop
    begin
      v_mutation_id := (v_item->>'mutationId')::uuid;
      v_kind := v_item->>'entityKind';
      v_entity_id := v_item->>'entityId';
      v_operation := v_item->>'operation';
      v_schema_version := (v_item->>'schemaVersion')::smallint;
      v_base_revision := (v_item->>'baseRevision')::bigint;
    exception when others then
      raise exception 'INVALID_MUTATION_SHAPE' using errcode = '22023';
    end;

    if v_kind not in ('activity', 'progress', 'review', 'attempt', 'writing', 'simulation_result') then
      raise exception 'INVALID_ENTITY_KIND' using errcode = '22023';
    end if;
    if v_entity_id is null or char_length(v_entity_id) < 1 or char_length(v_entity_id) > 512 then
      raise exception 'INVALID_ENTITY_ID' using errcode = '22023';
    end if;
    if v_operation not in ('upsert', 'delete') then
      raise exception 'INVALID_OPERATION' using errcode = '22023';
    end if;
    if v_schema_version <> 1 then
      raise exception 'INVALID_SCHEMA_VERSION' using errcode = '22023';
    end if;
    if v_base_revision < 0 then
      raise exception 'INVALID_BASE_REVISION' using errcode = '22023';
    end if;
    if v_operation = 'delete' and v_base_revision = 0 then
      raise exception 'DELETE_REQUIRES_BASE_REVISION' using errcode = '22023';
    end if;

    if v_operation = 'upsert' then
      v_payload := v_item->'payload';
      if v_payload is null or jsonb_typeof(v_payload) <> 'object' then
        raise exception 'INVALID_PAYLOAD' using errcode = '22023';
      end if;
    else
      if (v_item ? 'payload') and v_item->'payload' <> 'null'::jsonb then
        raise exception 'DELETE_PAYLOAD_MUST_BE_NULL' using errcode = '22023';
      end if;
      v_payload := 'null'::jsonb;
    end if;

    if v_kind = 'attempt' and v_payload->>'questionId' = 'QREF-QUAD-ING001-032' then
      raise exception 'ANNULLED_QUESTION_FORBIDDEN' using errcode = '22023';
    end if;

    v_expected_payload_hash := public.central_cloud_hash(v_payload);
    if v_item->>'payloadHash' is distinct from v_expected_payload_hash then
      raise exception 'PAYLOAD_HASH_MISMATCH' using errcode = '22023';
    end if;
    v_expected_request_hash := public.central_cloud_request_hash(
      v_mutation_id, v_kind, v_entity_id, v_operation,
      v_schema_version, v_base_revision, v_expected_payload_hash
    );
    if v_item->>'requestHash' is distinct from v_expected_request_hash then
      raise exception 'REQUEST_HASH_MISMATCH' using errcode = '22023';
    end if;
  end loop;

  -- Pass 2: apply each semantic item. CAS conflicts are durable per-item outcomes.
  for v_item in select value from jsonb_array_elements(p_mutations)
  loop
    v_mutation_id := (v_item->>'mutationId')::uuid;
    v_kind := v_item->>'entityKind';
    v_entity_id := v_item->>'entityId';
    v_operation := v_item->>'operation';
    v_schema_version := (v_item->>'schemaVersion')::smallint;
    v_base_revision := (v_item->>'baseRevision')::bigint;
    v_payload := case when v_operation = 'delete' then 'null'::jsonb else v_item->'payload' end;
    v_payload_hash := v_item->>'payloadHash';
    v_request_hash := v_item->>'requestHash';

    select * into v_receipt
      from public.central_sync_mutations
      where user_id = p_user_id and mutation_id = v_mutation_id;
    if found then
      if v_receipt.request_hash <> v_request_hash then
        raise exception 'INTEGRITY_CONFLICT mutationId=%', v_mutation_id using errcode = '23514';
      end if;
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'mutationId', v_mutation_id::text,
        'requestHash', v_request_hash,
        'outcome', 'duplicate',
        'originalOutcome', v_receipt.result_code,
        'revision', v_receipt.applied_revision,
        'changeSeq', v_receipt.applied_change_seq,
        'stateHash', v_receipt.resulting_state_hash,
        'currentRevision', v_receipt.current_revision,
        'currentPayloadHash', v_receipt.current_payload_hash,
        'deleted', v_receipt.current_deleted
      )));
      continue;
    end if;

    select * into v_record
      from public.central_study_records
      where user_id = p_user_id and kind = v_kind and entity_id = v_entity_id
      for update;
    v_record_exists := found;

    if (v_base_revision = 0 and v_record_exists)
       or (v_base_revision > 0 and (not v_record_exists or v_record.revision <> v_base_revision)) then
      v_current_revision := case when v_record_exists then v_record.revision else 0 end;
      v_current_payload_hash := case when v_record_exists then v_record.payload_hash else null end;
      v_current_deleted := case when v_record_exists then v_record.deleted_at is not null else false end;
      insert into public.central_sync_mutations (
        user_id, mutation_id, request_hash, kind, entity_id, base_revision,
        operation, result_code, current_revision, current_payload_hash, current_deleted
      ) values (
        p_user_id, v_mutation_id, v_request_hash, v_kind, v_entity_id, v_base_revision,
        v_operation, 'conflict', v_current_revision, v_current_payload_hash, v_current_deleted
      );
      v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'mutationId', v_mutation_id::text,
        'requestHash', v_request_hash,
        'outcome', 'conflict',
        'currentRevision', v_current_revision,
        'currentPayloadHash', v_current_payload_hash,
        'deleted', v_current_deleted
      )));
      continue;
    end if;

    v_revision := v_base_revision + 1;
    if v_operation = 'upsert' then
      v_state_hash := v_payload_hash;
      if not v_record_exists then
        insert into public.central_study_records (
          user_id, kind, entity_id, schema_version, revision,
          payload, payload_hash, state_hash, deleted_at, server_updated_at, last_mutation_id
        ) values (
          p_user_id, v_kind, v_entity_id, v_schema_version, v_revision,
          v_payload, v_payload_hash, v_state_hash, null, now(), v_mutation_id
        ) returning change_seq into v_change_seq;
      else
        update public.central_study_records
          set schema_version = v_schema_version,
              revision = v_revision,
              change_seq = nextval('public.central_study_change_seq'::regclass),
              payload = v_payload,
              payload_hash = v_payload_hash,
              state_hash = v_state_hash,
              deleted_at = null,
              server_updated_at = now(),
              last_mutation_id = v_mutation_id
          where user_id = p_user_id and kind = v_kind and entity_id = v_entity_id
          returning change_seq into v_change_seq;
      end if;
    else
      v_state_hash := public.central_cloud_hash(jsonb_build_object('deleted', true));
      update public.central_study_records
        set schema_version = v_schema_version,
            revision = v_revision,
            change_seq = nextval('public.central_study_change_seq'::regclass),
            payload = null,
            payload_hash = null,
            state_hash = v_state_hash,
            deleted_at = now(),
            server_updated_at = now(),
            last_mutation_id = v_mutation_id
        where user_id = p_user_id and kind = v_kind and entity_id = v_entity_id
        returning change_seq into v_change_seq;
    end if;

    insert into public.central_sync_mutations (
      user_id, mutation_id, request_hash, kind, entity_id, base_revision,
      operation, result_code, applied_revision, applied_change_seq, resulting_state_hash
    ) values (
      p_user_id, v_mutation_id, v_request_hash, v_kind, v_entity_id, v_base_revision,
      v_operation, 'applied', v_revision, v_change_seq, v_state_hash
    );

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'mutationId', v_mutation_id::text,
      'requestHash', v_request_hash,
      'outcome', 'applied',
      'revision', v_revision,
      'changeSeq', v_change_seq,
      'stateHash', v_state_hash
    ));
  end loop;

  return v_results;
end;
$$;

-- Browser remains read-only. The backend secret maps to service_role and is the
-- only caller allowed to invoke the SECURITY INVOKER writer.
revoke all on function public.central_cloud_canonical_jsonb(jsonb) from public, anon, authenticated;
revoke all on function public.central_cloud_hash(jsonb) from public, anon, authenticated;
revoke all on function public.central_cloud_request_hash(uuid, text, text, text, smallint, bigint, text) from public, anon, authenticated;
revoke all on function public.central_apply_cloud_mutations(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.central_cloud_canonical_jsonb(jsonb) to service_role;
grant execute on function public.central_cloud_hash(jsonb) to service_role;
grant execute on function public.central_cloud_request_hash(uuid, text, text, text, smallint, bigint, text) to service_role;
grant execute on function public.central_apply_cloud_mutations(uuid, jsonb) to service_role;

grant select, insert, update on table public.central_study_records to service_role;
grant select, insert on table public.central_sync_mutations to service_role;
grant usage, select on sequence public.central_study_change_seq to service_role;

comment on function public.central_apply_cloud_mutations(uuid, jsonb) is
  'PR-4 backend-only CAS writer. SECURITY INVOKER; caller must authenticate user and derive p_user_id from verified identity.';
