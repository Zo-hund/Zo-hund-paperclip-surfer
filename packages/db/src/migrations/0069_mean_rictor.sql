ALTER TABLE "company_memberships" ADD COLUMN "credential_id" text;--> statement-breakpoint
ALTER TABLE "company_memberships" ADD COLUMN "credential_data" jsonb;