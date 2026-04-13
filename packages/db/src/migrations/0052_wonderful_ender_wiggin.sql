ALTER TABLE "rq_submissions" DROP CONSTRAINT "rq_submissions_issue_id_issues_id_fk";
--> statement-breakpoint
DROP INDEX "rq_company_lifecycle_idx";--> statement-breakpoint
ALTER TABLE "rq_submissions" DROP COLUMN "issue_id";--> statement-breakpoint
ALTER TABLE "rq_submissions" DROP COLUMN "lifecycle_stage";--> statement-breakpoint
ALTER TABLE "rq_submissions" DROP COLUMN "is_simulation";--> statement-breakpoint
ALTER TABLE "rq_submissions" DROP COLUMN "credit_cost";--> statement-breakpoint
ALTER TABLE "rq_submissions" DROP COLUMN "token_cost";--> statement-breakpoint
ALTER TABLE "rq_submissions" DROP COLUMN "simulation_status";