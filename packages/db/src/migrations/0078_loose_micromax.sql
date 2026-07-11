CREATE TABLE "amx_global_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_type" text DEFAULT 'user' NOT NULL,
	"principal_id" text NOT NULL,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"token_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "amx_global_ledger_principal_idx" ON "amx_global_ledger" USING btree ("principal_type","principal_id");