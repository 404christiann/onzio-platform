-- Phase 7: keep exposed security-invoker billing wrappers independent of
-- caller-controlled role search paths.

alter function onzio.get_club_runtime_access(uuid)
  set search_path to '';

alter function onzio.record_stripe_rejection(
  text,
  text,
  timestamptz,
  text,
  uuid,
  text,
  text
)
  set search_path to '';

alter function onzio.apply_stripe_projection(
  text,
  text,
  timestamptz,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  boolean,
  timestamptz,
  timestamptz,
  text,
  text
)
  set search_path to '';
