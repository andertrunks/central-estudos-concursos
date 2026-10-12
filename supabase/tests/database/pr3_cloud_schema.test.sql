begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('public', 'central_study_records', 'central_study_records exists');
select has_table('public', 'central_sync_mutations', 'central_sync_mutations exists');
select ok(
  exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'central_study_change_seq' and c.relkind = 'S'
  ),
  'global change sequence exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.central_study_records'::regclass),
  'RLS is enabled on records'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.central_sync_mutations'::regclass),
  'RLS is enabled on mutation receipts'
);

select ok(not has_table_privilege('anon', 'public.central_study_records', 'SELECT'), 'anon cannot read records');
select ok(not has_table_privilege('anon', 'public.central_sync_mutations', 'SELECT'), 'anon cannot read receipts');
select ok(has_table_privilege('authenticated', 'public.central_study_records', 'SELECT'), 'authenticated can read records');
select ok(has_table_privilege('authenticated', 'public.central_sync_mutations', 'SELECT'), 'authenticated can read receipts');
select ok(not has_table_privilege('authenticated', 'public.central_study_records', 'INSERT'), 'authenticated cannot insert records directly');
select ok(not has_table_privilege('authenticated', 'public.central_study_records', 'UPDATE'), 'authenticated cannot update records directly');
select ok(not has_table_privilege('authenticated', 'public.central_study_records', 'DELETE'), 'authenticated cannot delete records directly');
select ok(not has_table_privilege('authenticated', 'public.central_sync_mutations', 'INSERT'), 'authenticated cannot insert receipts directly');
select ok(not has_table_privilege('authenticated', 'public.central_sync_mutations', 'UPDATE'), 'authenticated cannot update receipts directly');
select ok(not has_table_privilege('authenticated', 'public.central_sync_mutations', 'DELETE'), 'authenticated cannot delete receipts directly');
select ok(not has_sequence_privilege('authenticated', 'public.central_study_change_seq', 'USAGE'), 'authenticated cannot allocate change_seq');
select ok(not has_table_privilege('service_role', 'public.central_study_records', 'DELETE'), 'backend writer cannot hard-delete study records');

select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'central_study_records'),
  1::bigint,
  'records expose exactly one RLS policy'
);
select is(
  (select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'central_sync_mutations'),
  1::bigint,
  'receipts expose exactly one RLS policy'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('central_study_records', 'central_sync_mutations') and cmd <> 'SELECT'
  ),
  'there are no browser write policies'
);

select ok(
  exists (select 1 from pg_constraint where conname = 'central_study_records_tombstone_check'),
  'tombstone shape is constrained'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'central_study_records_state_hash_check'),
  'record state hashes are constrained'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'central_study_records_change_seq_key'),
  'change_seq is globally unique'
);
select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'central_%' and p.prosecdef
  ),
  'cloud schema exposes no SECURITY DEFINER writer'
);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'pr3-user-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'pr3-user-b@example.invalid');

insert into public.central_study_records (
  user_id, kind, entity_id, schema_version, revision, payload, payload_hash, state_hash
) values
  (
    '11111111-1111-4111-8111-111111111111', 'progress', 'TI-BD-003', 1, 1,
    '{"percent":25}'::jsonb,
    'sha256:' || repeat('a', 64),
    'sha256:' || repeat('b', 64)
  ),
  (
    '11111111-1111-4111-8111-111111111111', 'review', 'TI-BD-003:R1', 1, 1,
    '{"due":"2026-10-20"}'::jsonb,
    'sha256:' || repeat('c', 64),
    'sha256:' || repeat('d', 64)
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'progress', 'TI-BD-003', 1, 1,
    '{"percent":90}'::jsonb,
    'sha256:' || repeat('e', 64),
    'sha256:' || repeat('f', 64)
  );

insert into public.central_sync_mutations (
  user_id, mutation_id, request_hash, kind, entity_id, base_revision, result_code,
  applied_revision, applied_change_seq, resulting_state_hash
) values
  (
    '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'sha256:' || repeat('1', 64), 'progress', 'TI-BD-003', 0, 'applied', 1,
    (select change_seq from public.central_study_records where user_id = '11111111-1111-4111-8111-111111111111' and kind = 'progress' and entity_id = 'TI-BD-003'),
    'sha256:' || repeat('b', 64)
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'sha256:' || repeat('2', 64), 'progress', 'TI-BD-003', 0, 'applied', 1,
    (select change_seq from public.central_study_records where user_id = '22222222-2222-4222-8222-222222222222' and kind = 'progress' and entity_id = 'TI-BD-003'),
    'sha256:' || repeat('f', 64)
  );

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  'select count(*)::bigint from public.central_study_records',
  array[2::bigint],
  'user A sees only its own records'
);
select results_eq(
  $$select count(*)::bigint from public.central_study_records where user_id = '22222222-2222-4222-8222-222222222222'::uuid$$,
  array[0::bigint],
  'user A cannot see user B records'
);
select results_eq(
  'select count(*)::bigint from public.central_sync_mutations',
  array[1::bigint],
  'user A sees only its own mutation receipt'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';

select results_eq(
  'select count(*)::bigint from public.central_study_records',
  array[1::bigint],
  'user B sees only its own record'
);
select results_eq(
  $$select count(*)::bigint from public.central_sync_mutations where user_id = '11111111-1111-4111-8111-111111111111'::uuid$$,
  array[0::bigint],
  'user B cannot see user A receipt'
);

reset role;

select ok(
  (select max(change_seq) > min(change_seq) from public.central_study_records),
  'server change sequence advances monotonically across inserted records'
);

select * from finish();
rollback;
