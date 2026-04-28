CREATE TABLE "marketplace_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"headline" text,
	"bio" text,
	"location" text,
	"role_intent" text DEFAULT 'none' NOT NULL,
	"partner_status" text DEFAULT 'none' NOT NULL,
	"eligibility_status" text DEFAULT 'ineligible' NOT NULL,
	"review_reason" text,
	"application_submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"lms_credits" integer DEFAULT 500 NOT NULL,
	"amx_token_balance" integer DEFAULT 750 NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payout_wallet" text,
	"availability" text DEFAULT 'available' NOT NULL,
	"supported_run_phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "marketplace_profiles_partner_status_idx" ON "marketplace_profiles" USING btree ("partner_status");
--> statement-breakpoint
CREATE INDEX "marketplace_profiles_role_intent_idx" ON "marketplace_profiles" USING btree ("role_intent");
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider_user_id" text NOT NULL,
	"listing_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"badges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hourly_rate_tokens" integer NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"supported_run_phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payout_wallet" text,
	"location" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "marketplace_listings_company_status_idx" ON "marketplace_listings" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX "marketplace_listings_provider_idx" ON "marketplace_listings" USING btree ("provider_user_id");
--> statement-breakpoint
CREATE INDEX "marketplace_listings_type_idx" ON "marketplace_listings" USING btree ("listing_type");
