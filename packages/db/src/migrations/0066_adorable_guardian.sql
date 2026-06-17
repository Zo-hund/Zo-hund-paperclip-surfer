CREATE TABLE "stripe_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"tier_name" text NOT NULL,
	"stripe_product_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"amount" integer NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"tier_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_prices" ADD CONSTRAINT "stripe_prices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_subscriptions" ADD CONSTRAINT "stripe_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_price_id_unique_idx" ON "stripe_prices" USING btree ("stripe_price_id");--> statement-breakpoint
CREATE INDEX "stripe_price_company_tier_idx" ON "stripe_prices" USING btree ("company_id","tier_name");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_sub_subscription_id_idx" ON "stripe_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_company_user_idx" ON "stripe_subscriptions" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_customer_idx" ON "stripe_subscriptions" USING btree ("stripe_customer_id");