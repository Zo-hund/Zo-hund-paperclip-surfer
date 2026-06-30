-- Safely drop the unique index/constraint if a prior failed deploy partially created it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'issue_work_products_issue_provider_external_id_uq') THEN
    DROP INDEX "issue_work_products_issue_provider_external_id_uq";
  END IF;
END $$;