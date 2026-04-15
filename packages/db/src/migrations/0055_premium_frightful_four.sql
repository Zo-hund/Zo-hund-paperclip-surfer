ALTER TABLE "heartbeat_runs" ADD COLUMN "run_mode" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "swarm_batch_id" text;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD COLUMN "promoted_from_run_id" uuid;--> statement-breakpoint
ALTER TABLE "heartbeat_runs" ADD CONSTRAINT "heartbeat_runs_promoted_from_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("promoted_from_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;