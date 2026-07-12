CREATE TABLE "harnesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"adapter_type" text DEFAULT 'openrouter' NOT NULL,
	"model" text DEFAULT 'openrouter/auto' NOT NULL,
	"toolbelt_id" uuid,
	"guardrails" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "toolbelts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"tool_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "is_public_profile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "skills" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "harness_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "company_events" ADD COLUMN "event_type" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_events" ADD COLUMN "source_booking_id" uuid;--> statement-breakpoint
ALTER TABLE "lms_marketplace_bookings" ADD COLUMN "scheduled_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lms_marketplace_bookings" ADD COLUMN "scheduled_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lms_marketplace_listings" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lms_member_profiles" ADD COLUMN "is_public_profile" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "harnesses" ADD CONSTRAINT "harnesses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harnesses" ADD CONSTRAINT "harnesses_toolbelt_id_toolbelts_id_fk" FOREIGN KEY ("toolbelt_id") REFERENCES "public"."toolbelts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toolbelts" ADD CONSTRAINT "toolbelts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "harnesses_company_key_idx" ON "harnesses" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "harnesses_category_idx" ON "harnesses" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "toolbelts_company_key_idx" ON "toolbelts" USING btree ("company_id","key");--> statement-breakpoint
CREATE INDEX "toolbelts_category_idx" ON "toolbelts" USING btree ("category");