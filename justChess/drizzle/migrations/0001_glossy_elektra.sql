ALTER TABLE "games" ADD COLUMN "draw_offered_by" varchar(5);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "friend_code" varchar(8) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_friend_code_unique" UNIQUE("friend_code");