begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'central_apply_cloud_mutations'
  ),
  'PR-4 writer exists'
);
select ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'central_apply_cloud_mutations' and p.prosecdef
  ),
  'writer is SECURITY INVOKER, never SECURITY DEFINER'
);
select ok(
  position(
    'pg_advisory_xact_lock' in
    pg_get_functiondef('public.central_apply_cloud_mutations(uuid,jsonb)'::regprocedure)
  ) > 0,
  'writer serializes same-user calls before receipt/CAS evaluation'
);
select ok(
  has_function_privilege('service_role', 'public.central_apply_cloud_mutations(uuid,jsonb)', 'EXECUTE'),
  'service_role may execute backend writer'
);
select ok(
  not has_function_privilege('authenticated', 'public.central_apply_cloud_mutations(uuid,jsonb)', 'EXECUTE'),
  'authenticated browser cannot execute writer RPC directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.central_study_records', 'INSERT')
  and not has_table_privilege('authenticated', 'public.central_study_records', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.central_study_records', 'DELETE'),
  'authenticated browser remains read-only on study records'
);
select ok(
  has_table_privilege('service_role', 'public.central_study_records', 'INSERT')
  and has_table_privilege('service_role', 'public.central_study_records', 'UPDATE')
  and not has_table_privilege('service_role', 'public.central_study_records', 'DELETE'),
  'backend writer has minimal record privileges and no hard DELETE'
);
select is(
  public.central_cloud_canonical_jsonb('{"b":1,"a":2}'::jsonb),
  '{"a":2,"b":1}',
  'canonical JSON sorts object keys without whitespace'
);
select ok(
  public.central_cloud_hash('{"a":2,"b":1}'::jsonb) ~ '^sha256:[0-9a-f]{64}$',
  'server hash uses sha256 envelope'
);

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'pr4-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'pr4-b@example.invalid');

create temp table pr4_capture (label text primary key, value bigint);
create temp table pr4_flags (label text primary key, value boolean);

set local role service_role;
select lives_ok(
  $$select public.central_apply_cloud_mutations(
    '11111111-1111-4111-8111-111111111111'::uuid,
    jsonb_build_array(jsonb_build_object(
      'mutationId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',0,
      'payload', '{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":10,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb,
      'payloadHash', public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":10,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb),
      'requestHash', public.central_cloud_request_hash(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'progress','TI-BD-003','upsert',1::smallint,0::bigint,
        public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":10,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb)
      )
    ))
  )$$,
  'writer applies first CAS create'
);
reset role;

select is(
  (select revision from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='progress' and entity_id='TI-BD-003'),
  1::bigint,
  'first mutation creates revision 1'
);
select is(
  (select result_code from public.central_sync_mutations where user_id='11111111-1111-4111-8111-111111111111' and mutation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'applied',
  'applied mutation gets durable receipt'
);
insert into pr4_capture values ('first-seq', (select change_seq from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='progress' and entity_id='TI-BD-003'));

set local role service_role;
select lives_ok(
  $$select public.central_apply_cloud_mutations(
    '11111111-1111-4111-8111-111111111111'::uuid,
    jsonb_build_array(jsonb_build_object(
      'mutationId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',0,
      'payload', '{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":10,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb,
      'payloadHash', public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":10,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb),
      'requestHash', public.central_cloud_request_hash(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'progress','TI-BD-003','upsert',1::smallint,0::bigint,
        public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":10,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb)
      )
    ))
  )$$,
  'identical retry is accepted as duplicate'
);
reset role;
select is(
  (select change_seq from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='progress' and entity_id='TI-BD-003'),
  (select value from pr4_capture where label='first-seq'),
  'duplicate retry creates no new change_seq'
);
select is(
  (select count(*)::bigint from public.central_sync_mutations where user_id='11111111-1111-4111-8111-111111111111' and mutation_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1::bigint,
  'duplicate retry keeps one receipt'
);

do $$
begin
  set local role service_role;
  perform public.central_apply_cloud_mutations(
    '11111111-1111-4111-8111-111111111111'::uuid,
    jsonb_build_array(jsonb_build_object(
      'mutationId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',1,
      'payload','{"id":"TI-BD-003"}'::jsonb,
      'payloadHash', public.central_cloud_hash('{"id":"TI-BD-003"}'::jsonb),
      'requestHash', public.central_cloud_request_hash('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'progress','TI-BD-003','upsert',1::smallint,1::bigint,public.central_cloud_hash('{"id":"TI-BD-003"}'::jsonb))
    ))
  );
  reset role;
  insert into pr4_flags values ('integrity-rejected', false);
exception when check_violation then
  reset role;
  insert into pr4_flags values ('integrity-rejected', true);
end $$;
select is((select value from pr4_flags where label='integrity-rejected'), true, 'same mutationId with different requestHash is hard rejected');

set local role service_role;
select public.central_apply_cloud_mutations(
  '11111111-1111-4111-8111-111111111111'::uuid,
  jsonb_build_array(jsonb_build_object(
    'mutationId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',1,
    'payload', '{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":20,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb,
    'payloadHash', public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":20,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb),
    'requestHash', public.central_cloud_request_hash('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid,'progress','TI-BD-003','upsert',1::smallint,1::bigint,public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":20,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb))
  )));
select public.central_apply_cloud_mutations(
  '11111111-1111-4111-8111-111111111111'::uuid,
  jsonb_build_array(jsonb_build_object(
    'mutationId','cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',1,
    'payload', '{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":30,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb,
    'payloadHash', public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":30,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb),
    'requestHash', public.central_cloud_request_hash('cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,'progress','TI-BD-003','upsert',1::smallint,1::bigint,public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":30,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb))
  )));
reset role;
select is((select revision from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='progress' and entity_id='TI-BD-003'), 2::bigint, 'only one device advances shared base revision');
select is((select result_code from public.central_sync_mutations where user_id='11111111-1111-4111-8111-111111111111' and mutation_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'conflict', 'losing stale mutation gets durable conflict receipt');

set local role service_role;
select public.central_apply_cloud_mutations(
  '11111111-1111-4111-8111-111111111111'::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'mutationId','dddddddd-dddd-4ddd-8ddd-dddddddddddd','entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',1,
      'payload','{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":40,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb,
      'payloadHash',public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":40,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb),
      'requestHash',public.central_cloud_request_hash('dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid,'progress','TI-BD-003','upsert',1::smallint,1::bigint,public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":40,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb))
    ),
    jsonb_build_object(
      'mutationId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','entityKind','review','entityId','TI-BD-003:R1','operation','upsert','schemaVersion',1,'baseRevision',0,
      'payload','{"id":"TI-BD-003:R1","contentId":"TI-BD-003","stage":"D1","due":"2026-10-13","doneAt":null}'::jsonb,
      'payloadHash',public.central_cloud_hash('{"id":"TI-BD-003:R1","contentId":"TI-BD-003","stage":"D1","due":"2026-10-13","doneAt":null}'::jsonb),
      'requestHash',public.central_cloud_request_hash('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid,'review','TI-BD-003:R1','upsert',1::smallint,0::bigint,public.central_cloud_hash('{"id":"TI-BD-003:R1","contentId":"TI-BD-003","stage":"D1","due":"2026-10-13","doneAt":null}'::jsonb))
    )
  ));
reset role;
select is((select result_code from public.central_sync_mutations where mutation_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'conflict', 'conflict remains per-item inside mixed batch');
select is((select revision from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='review' and entity_id='TI-BD-003:R1'), 1::bigint, 'non-conflicting item in same batch still applies');

set local role service_role;
select public.central_apply_cloud_mutations(
  '11111111-1111-4111-8111-111111111111'::uuid,
  jsonb_build_array(jsonb_build_object(
    'mutationId','ffffffff-ffff-4fff-8fff-ffffffffffff','entityKind','progress','entityId','TI-BD-003','operation','delete','schemaVersion',1,'baseRevision',2,
    'payload',null,
    'payloadHash',public.central_cloud_hash('null'::jsonb),
    'requestHash',public.central_cloud_request_hash('ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,'progress','TI-BD-003','delete',1::smallint,2::bigint,public.central_cloud_hash('null'::jsonb))
  )));
reset role;
select ok((select deleted_at is not null and payload is null and payload_hash is null and revision=3 from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='progress' and entity_id='TI-BD-003'), 'delete produces revisioned tombstone without hard delete');

set local role service_role;
select public.central_apply_cloud_mutations(
  '11111111-1111-4111-8111-111111111111'::uuid,
  jsonb_build_array(jsonb_build_object(
    'mutationId','12121212-1212-4212-8212-121212121212','entityKind','progress','entityId','TI-BD-003','operation','upsert','schemaVersion',1,'baseRevision',2,
    'payload','{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":99,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb,
    'payloadHash',public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":99,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb),
    'requestHash',public.central_cloud_request_hash('12121212-1212-4212-8212-121212121212'::uuid,'progress','TI-BD-003','upsert',1::smallint,2::bigint,public.central_cloud_hash('{"id":"TI-BD-003","status":"em andamento","startedAt":"2026-10-12","completedAt":null,"lastAccess":"2026-10-12","percent":99,"correct":0,"wrong":0,"total":0,"lastReview":null,"nextReview":null}'::jsonb))
  )));
reset role;
select is((select result_code from public.central_sync_mutations where mutation_id='12121212-1212-4212-8212-121212121212'), 'conflict', 'stale upsert against tombstone conflicts');
select ok((select deleted_at is not null and revision=3 from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111' and kind='progress' and entity_id='TI-BD-003'), 'stale device cannot resurrect tombstone');

-- Complete-request validation: annulled question rejects before any item is written.
create temp table pr4_invalid_batches (payload jsonb not null);
insert into pr4_invalid_batches(payload)
values (jsonb_build_array(
  jsonb_build_object(
    'mutationId','13131313-1313-4313-8313-131313131313','entityKind','attempt','entityId','ATT-ANNULLED','operation','upsert','schemaVersion',1,'baseRevision',0,
    'payload','{"id":"ATT-ANNULLED","questionId":"QREF-QUAD-ING001-032","contentId":"ING-001","date":"2026-10-12","answer":"A","correct":false,"reason":"conteúdo","resolvedAt":null}'::jsonb,
    'payloadHash',public.central_cloud_hash('{"id":"ATT-ANNULLED","questionId":"QREF-QUAD-ING001-032","contentId":"ING-001","date":"2026-10-12","answer":"A","correct":false,"reason":"conteúdo","resolvedAt":null}'::jsonb),
    'requestHash',public.central_cloud_request_hash('13131313-1313-4313-8313-131313131313'::uuid,'attempt','ATT-ANNULLED','upsert',1::smallint,0::bigint,public.central_cloud_hash('{"id":"ATT-ANNULLED","questionId":"QREF-QUAD-ING001-032","contentId":"ING-001","date":"2026-10-12","answer":"A","correct":false,"reason":"conteúdo","resolvedAt":null}'::jsonb))
  ),
  jsonb_build_object(
    'mutationId','14141414-1414-4414-8414-141414141414','entityKind','review','entityId','SHOULD-NOT-WRITE','operation','upsert','schemaVersion',1,'baseRevision',0,
    'payload','{"id":"SHOULD-NOT-WRITE","contentId":"TI-BD-003","stage":"D1","due":"2026-10-13","doneAt":null}'::jsonb,
    'payloadHash',public.central_cloud_hash('{"id":"SHOULD-NOT-WRITE","contentId":"TI-BD-003","stage":"D1","due":"2026-10-13","doneAt":null}'::jsonb),
    'requestHash',public.central_cloud_request_hash('14141414-1414-4414-8414-141414141414'::uuid,'review','SHOULD-NOT-WRITE','upsert',1::smallint,0::bigint,public.central_cloud_hash('{"id":"SHOULD-NOT-WRITE","contentId":"TI-BD-003","stage":"D1","due":"2026-10-13","doneAt":null}'::jsonb))
  )
));
grant select on table pr4_invalid_batches to service_role;
set local role service_role;
select throws_ok(
  $$select public.central_apply_cloud_mutations(
    '11111111-1111-4111-8111-111111111111'::uuid,
    (select payload from pr4_invalid_batches limit 1)
  )$$,
  '22023',
  'ANNULLED_QUESTION_FORBIDDEN',
  'QREF032 is rejected by writer validation'
);
reset role;
select is((select count(*)::bigint from public.central_sync_mutations where mutation_id in ('13131313-1313-4313-8313-131313131313','14141414-1414-4414-8414-141414141414')), 0::bigint, 'invalid batch creates no semantic receipts');
select is((select count(*)::bigint from public.central_study_records where entity_id='SHOULD-NOT-WRITE'), 0::bigint, 'invalid batch creates no other domain row');

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select results_eq(
  $$select count(*)::bigint from public.central_study_records where user_id='11111111-1111-4111-8111-111111111111'::uuid$$,
  array[0::bigint],
  'user B cannot SELECT user A rows through RLS'
);
reset role;

select * from finish();
rollback;
