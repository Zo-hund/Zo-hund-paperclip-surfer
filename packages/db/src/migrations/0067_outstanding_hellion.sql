ALTER TABLE "lms_member_profiles" ADD COLUMN "partner_status" text;--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD COLUMN "ambassador_status" text;--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD COLUMN "marketplace_revenue" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD COLUMN "donation_amount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD COLUMN "sponsorship_tier" text;