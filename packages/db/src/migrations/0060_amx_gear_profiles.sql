ALTER TABLE "issues"
ADD COLUMN IF NOT EXISTS "runtime_requirements" jsonb;
