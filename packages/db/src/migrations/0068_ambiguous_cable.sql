-- Safely drop the unique index if a prior failed deploy partially created it.
DROP INDEX IF EXISTS "issue_work_products_issue_provider_external_id_uq";