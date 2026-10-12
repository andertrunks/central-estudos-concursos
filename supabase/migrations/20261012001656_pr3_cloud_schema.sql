-- PR-3 CLOUD-SCHEMA
-- Estado privado do aluno somente. O catálogo editorial continua estático no Git.
-- O writer transacional/CAS será implementado no PR seguinte; este PR deixa o
-- navegador autenticado estritamente read-only e fecha o envelope remoto.

create sequence public.central_study_change_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table public.central_study_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  entity_id text not null,
  schema_version smallint not null,
  revision bigint not null,
  change_seq bigint not null default nextval('public.central_study_change_seq'::regclass),
  payload jsonb null,
  payload_hash text null,
  state_hash text not null,
  deleted_at timestamptz null,
  server_updated_at timestamptz not null default now(),

  constraint central_study_records_pkey primary key (user_id, kind, entity_id),
  constraint central_study_records_kind_check check (
    kind in (
      'activity',
      'progress',
      'review',
      'attempt',
      'writing',
      'simulation_result',
      'submission',
      'simulation_submission'
    )
  ),
  constraint central_study_records_entity_id_check check (
    char_length(entity_id) between 1 and 512
  ),
  constraint central_study_records_schema_version_check check (schema_version > 0),
  constraint central_study_records_revision_check check (revision > 0),
  constraint central_study_records_change_seq_check check (change_seq > 0),
  constraint central_study_records_change_seq_key unique (change_seq),
  constraint central_study_records_payload_hash_check check (
    payload_hash is null or payload_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint central_study_records_state_hash_check check (
    state_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint central_study_records_tombstone_check check (
    (
      deleted_at is null
      and payload is not null
      and jsonb_typeof(payload) = 'object'
      and payload_hash is not null
    )
    or
    (
      deleted_at is not null
      and payload is null
      and payload_hash is null
    )
  )
);

alter sequence public.central_study_change_seq
  owned by public.central_study_records.change_seq;

create index central_study_records_user_change_idx
  on public.central_study_records (user_id, change_seq);

create table public.central_sync_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request_hash text not null,
  kind text not null,
  entity_id text not null,
  base_revision bigint not null,
  result_code text not null,
  applied_revision bigint null,
  applied_change_seq bigint null,
  resulting_state_hash text null,
  processed_at timestamptz not null default now(),

  constraint central_sync_mutations_pkey primary key (user_id, mutation_id),
  constraint central_sync_mutations_request_hash_check check (
    request_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint central_sync_mutations_kind_check check (
    kind in (
      'activity',
      'progress',
      'review',
      'attempt',
      'writing',
      'simulation_result',
      'submission',
      'simulation_submission'
    )
  ),
  constraint central_sync_mutations_entity_id_check check (
    char_length(entity_id) between 1 and 512
  ),
  constraint central_sync_mutations_base_revision_check check (base_revision >= 0),
  constraint central_sync_mutations_result_code_check check (
    char_length(result_code) between 1 and 64
  ),
  constraint central_sync_mutations_applied_revision_check check (
    applied_revision is null or applied_revision > 0
  ),
  constraint central_sync_mutations_applied_change_seq_check check (
    applied_change_seq is null or applied_change_seq > 0
  ),
  constraint central_sync_mutations_resulting_state_hash_check check (
    resulting_state_hash is null
    or resulting_state_hash ~ '^sha256:[0-9a-f]{64}$'
  ),
  constraint central_sync_mutations_result_shape_check check (
    (
      applied_revision is null
      and applied_change_seq is null
      and resulting_state_hash is null
    )
    or
    (
      applied_revision is not null
      and applied_change_seq is not null
      and resulting_state_hash is not null
    )
  )
);

alter table public.central_study_records enable row level security;
alter table public.central_sync_mutations enable row level security;

create policy central_study_records_select_own
  on public.central_study_records
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

create policy central_sync_mutations_select_own
  on public.central_sync_mutations
  for select
  to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- Explicitly undo Supabase public-schema default grants. PR-3 is read-only from
-- the browser. The backend writer receives its minimal privileges only when its
-- protocol is implemented and tested in the next PR.
revoke all on table public.central_study_records from public, anon, authenticated, service_role;
revoke all on table public.central_sync_mutations from public, anon, authenticated, service_role;
revoke all on sequence public.central_study_change_seq from public, anon, authenticated, service_role;

grant select on table public.central_study_records to authenticated;
grant select on table public.central_sync_mutations to authenticated;

comment on table public.central_study_records is
  'Versioned private student-state envelope. Writes are intentionally unavailable to browser roles in PR-3.';
comment on table public.central_sync_mutations is
  'Immutable/idempotency receipt envelope for the future transactional sync writer. Browser roles are read-only.';
comment on sequence public.central_study_change_seq is
  'Server-side global ordering source for future accepted remote state changes.';
