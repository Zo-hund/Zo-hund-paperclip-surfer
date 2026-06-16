CREATE TABLE "company_webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status_code" integer,
	"response_body" text,
	"error" text,
	"duration_ms" integer,
	"attempt" integer DEFAULT 1 NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"description" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_webhook_deliveries" ADD CONSTRAINT "company_webhook_deliveries_webhook_id_company_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."company_webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_webhooks" ADD CONSTRAINT "company_webhooks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_webhook_deliveries_webhook_idx" ON "company_webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "company_webhook_deliveries_company_idx" ON "company_webhook_deliveries" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_webhooks_company_idx" ON "company_webhooks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "company_webhooks_enabled_idx" ON "company_webhooks" USING btree ("enabled");