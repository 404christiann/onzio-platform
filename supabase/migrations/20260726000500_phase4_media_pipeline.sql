create table onzio.media_cleanup_queue (
  id bigint generated always as identity primary key,
  club_id uuid not null references onzio.clubs(id) on delete restrict,
  storage_bucket text not null
    check (storage_bucket in ('onzio-upload-staging', 'onzio-media')),
  storage_path text not null,
  reason text not null
    check (reason in (
      'post-finalization-staging-delete',
      'published-object-retirement',
      'abandoned-staging-object'
    )),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (storage_bucket, storage_path),
  check (
    storage_path ~ (
      '^' || club_id::text ||
      '/[a-z][a-z0-9-]{0,63}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
    )
  )
);

create index media_cleanup_queue_due_idx
  on onzio.media_cleanup_queue (next_attempt_at)
  where completed_at is null;

alter table onzio.media_cleanup_queue enable row level security;
revoke all on onzio.media_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on onzio.media_cleanup_queue to service_role;
grant usage, select on sequence onzio.media_cleanup_queue_id_seq to service_role;

comment on table onzio.media_cleanup_queue is
  'Privileged retry ledger for media cleanup failures. No browser role has access.';

notify pgrst, 'reload schema';
