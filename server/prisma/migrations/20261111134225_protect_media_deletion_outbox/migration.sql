
-- =========================================================
-- Protect the media storage cleanup outbox.
--
-- Every deletion of project_media must enqueue the
-- original and preview keys in the same transaction.
--
-- Also covers ON DELETE CASCADE from projects and users.
-- =========================================================

CREATE OR REPLACE FUNCTION public.queue_deleted_media_objects()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  object_key_to_queue text;
  earliest_cleanup_at timestamptz;
BEGIN

  -- Preserve the original 30-minute upload safety grace.
  earliest_cleanup_at := GREATEST(
    clock_timestamp(),
    OLD.created_at + INTERVAL '30 minutes'
  );

  FOREACH object_key_to_queue IN ARRAY ARRAY[
    OLD.storage_key,
    OLD.preview_key
  ]
  LOOP

    IF object_key_to_queue IS NULL THEN
      CONTINUE;
    END IF;

    -- Match the application's managed key policy.
    -- Fail closed if a key is outside the managed namespace.
    IF object_key_to_queue !~*
      '^projects/[0-9a-f-]{36}/(previews/)?[0-9a-f-]{36}\.(jpg|jpeg|png|webp|mp4|webm|pdf)$'
    THEN
      RAISE EXCEPTION
        'Unsafe media storage key: deletion refused';
    END IF;

    INSERT INTO public.storage_deletion_jobs (
      id,
      object_key,
      next_attempt_at
    )
    VALUES (
      gen_random_uuid(),
      object_key_to_queue,
      earliest_cleanup_at
    )
    ON CONFLICT (object_key) DO NOTHING;

  END LOOP;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS
  trg_project_media_queue_deletion
ON public.project_media;

CREATE TRIGGER trg_project_media_queue_deletion
BEFORE DELETE ON public.project_media
FOR EACH ROW
EXECUTE FUNCTION public.queue_deleted_media_objects();


-- =========================================================
-- TRUNCATE does not execute row-level DELETE triggers.
-- Refuse truncation of the media metadata table.
-- =========================================================

CREATE OR REPLACE FUNCTION public.reject_project_media_truncate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'TRUNCATE refused: media cleanup would be bypassed';
END;
$$;

DROP TRIGGER IF EXISTS
  trg_project_media_reject_truncate
ON public.project_media;

CREATE TRIGGER trg_project_media_reject_truncate
BEFORE TRUNCATE ON public.project_media
FOR EACH STATEMENT
EXECUTE FUNCTION public.reject_project_media_truncate();
