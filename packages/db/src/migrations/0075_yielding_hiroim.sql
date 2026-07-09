CREATE TABLE "meeting_guest_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"guest_label" text,
	"created_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD COLUMN "guest_invite_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "meeting_guest_invites" ADD CONSTRAINT "meeting_guest_invites_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_guest_invites" ADD CONSTRAINT "meeting_guest_invites_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_guest_invites_token_hash_unique_idx" ON "meeting_guest_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "meeting_guest_invites_meeting_id_idx" ON "meeting_guest_invites" USING btree ("meeting_id");--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_guest_invite_id_meeting_guest_invites_id_fk" FOREIGN KEY ("guest_invite_id") REFERENCES "public"."meeting_guest_invites"("id") ON DELETE cascade ON UPDATE no action;