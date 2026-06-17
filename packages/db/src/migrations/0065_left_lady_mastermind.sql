CREATE TABLE "lms_marketplace_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"client_member_id" text NOT NULL,
	"project_title" text NOT NULL,
	"description" text,
	"budget_sims" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lms_marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"member_id" text NOT NULL,
	"display_name" text NOT NULL,
	"title" text NOT NULL,
	"bio" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hourly_rate_sims" integer DEFAULT 50 NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"rating" integer DEFAULT 0 NOT NULL,
	"review_count" integer DEFAULT 0 NOT NULL,
	"projects_completed" integer DEFAULT 0 NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD COLUMN "progression_stage" text DEFAULT 'explorer' NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_marketplace_bookings" ADD CONSTRAINT "lms_marketplace_bookings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_marketplace_bookings" ADD CONSTRAINT "lms_marketplace_bookings_listing_id_lms_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."lms_marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lms_marketplace_listings" ADD CONSTRAINT "lms_marketplace_listings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lms_marketplace_booking_listing_idx" ON "lms_marketplace_bookings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_booking_client_idx" ON "lms_marketplace_bookings" USING btree ("client_member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_booking_status_idx" ON "lms_marketplace_bookings" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "lms_marketplace_listing_member_idx" ON "lms_marketplace_listings" USING btree ("member_id","company_id");--> statement-breakpoint
CREATE INDEX "lms_marketplace_listing_company_active_idx" ON "lms_marketplace_listings" USING btree ("company_id","is_active");