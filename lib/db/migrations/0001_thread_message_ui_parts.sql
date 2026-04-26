ALTER TABLE "ThreadMessage"
  ADD COLUMN IF NOT EXISTS "parts" json,
  ADD COLUMN IF NOT EXISTS "attachments" json;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ThreadMessage'
      AND column_name = 'content'
  ) THEN
    UPDATE "ThreadMessage"
    SET "parts" = json_build_array(
      json_build_object('type', 'text', 'text', "content")
    )
    WHERE "parts" IS NULL;
  ELSE
    UPDATE "ThreadMessage"
    SET "parts" = '[]'::json
    WHERE "parts" IS NULL;
  END IF;
END $$;

UPDATE "ThreadMessage"
SET "attachments" = '[]'::json
WHERE "attachments" IS NULL;

ALTER TABLE "ThreadMessage"
  ALTER COLUMN "parts" SET NOT NULL,
  ALTER COLUMN "attachments" SET NOT NULL,
  ALTER COLUMN "role" TYPE varchar;

ALTER TABLE "ThreadMessage"
  DROP COLUMN IF EXISTS "content";
