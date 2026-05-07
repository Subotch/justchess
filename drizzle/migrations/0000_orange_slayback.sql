CREATE TYPE "public"."achievement_category" AS ENUM('gameplay', 'social', 'milestone', 'special');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'rejected', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."game_result" AS ENUM('white_wins', 'black_wins', 'draw', 'abandoned', 'in_progress');--> statement-breakpoint
CREATE TYPE "public"."game_result_reason" AS ENUM('checkmate', 'resignation', 'timeout', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule', 'agreement', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."game_type" AS ENUM('rated', 'casual', 'ai', 'tournament');--> statement-breakpoint
CREATE TYPE "public"."timing_category" AS ENUM('bullet', 'blitz', 'rapid', 'classical', 'correspondence');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_account_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"category" "achievement_category" NOT NULL,
	"icon_url" text,
	"points" smallint DEFAULT 10 NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"criteria" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_pair_unique" UNIQUE("requester_id","addressee_id")
);
--> statement-breakpoint
CREATE TABLE "game_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"move_number" smallint NOT NULL,
	"color" varchar(5) NOT NULL,
	"san" varchar(10) NOT NULL,
	"uci" varchar(5) NOT NULL,
	"fen" text NOT NULL,
	"time_spent_ms" integer,
	"clock_remaining_ms" integer,
	"eval_cp" integer,
	"eval_depth" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_moves_game_move_color_unique" UNIQUE("game_id","move_number","color")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"white_player_id" text,
	"black_player_id" text,
	"is_ai_game" boolean DEFAULT false NOT NULL,
	"ai_difficulty" smallint,
	"ai_color" varchar(5),
	"game_type" "game_type" DEFAULT 'casual' NOT NULL,
	"timing_category" "timing_category" DEFAULT 'rapid' NOT NULL,
	"time_control_minutes" smallint DEFAULT 10 NOT NULL,
	"increment_seconds" smallint DEFAULT 0 NOT NULL,
	"result" "game_result" DEFAULT 'in_progress' NOT NULL,
	"result_reason" "game_result_reason",
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"pgn" text,
	"final_fen" text,
	"opening_name" varchar(100),
	"opening_eco" varchar(5),
	"white_time_remaining_ms" integer,
	"black_time_remaining_ms" integer,
	"total_moves" smallint DEFAULT 0 NOT NULL,
	"white_rating_before" integer,
	"black_rating_before" integer,
	"white_rating_after" integer,
	"black_rating_after" integer,
	"peak_spectators" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_game_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"color" varchar(5) NOT NULL,
	"accuracy_percent" real,
	"blunders" smallint DEFAULT 0 NOT NULL,
	"mistakes" smallint DEFAULT 0 NOT NULL,
	"inaccuracies" smallint DEFAULT 0 NOT NULL,
	"brilliant_moves" smallint DEFAULT 0 NOT NULL,
	"good_moves" smallint DEFAULT 0 NOT NULL,
	"avg_move_time_ms" integer,
	"longest_move_time_ms" integer,
	"time_used_percent" real,
	"material_advantage_at_end" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_game_stats_unique" UNIQUE("game_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"game_id" uuid,
	"timing_category" "timing_category" NOT NULL,
	"rating_before" integer NOT NULL,
	"rating_after" integer NOT NULL,
	"rating_change" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" varchar(50) NOT NULL,
	"game_id" uuid,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_unique" UNIQUE("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "user_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" varchar(10) NOT NULL,
	"games_played" smallint DEFAULT 0 NOT NULL,
	"games_won" smallint DEFAULT 0 NOT NULL,
	"games_lost" smallint DEFAULT 0 NOT NULL,
	"games_drawn" smallint DEFAULT 0 NOT NULL,
	"rating_change" integer DEFAULT 0 NOT NULL,
	"time_played_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_daily_stats_unique" UNIQUE("user_id","date")
);
--> statement-breakpoint
CREATE TABLE "user_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"rating_rapid" integer DEFAULT 1200 NOT NULL,
	"rating_blitz" integer DEFAULT 1200 NOT NULL,
	"rating_bullet" integer DEFAULT 1200 NOT NULL,
	"rating_classical" integer DEFAULT 1200 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"games_won" integer DEFAULT 0 NOT NULL,
	"games_lost" integer DEFAULT 0 NOT NULL,
	"games_drawn" integer DEFAULT 0 NOT NULL,
	"games_abandoned" integer DEFAULT 0 NOT NULL,
	"current_win_streak" integer DEFAULT 0 NOT NULL,
	"best_win_streak" integer DEFAULT 0 NOT NULL,
	"current_daily_streak" integer DEFAULT 0 NOT NULL,
	"best_daily_streak" integer DEFAULT 0 NOT NULL,
	"puzzle_rating" integer DEFAULT 1200 NOT NULL,
	"puzzles_solved" integer DEFAULT 0 NOT NULL,
	"ai_games_played" integer DEFAULT 0 NOT NULL,
	"ai_games_won" integer DEFAULT 0 NOT NULL,
	"last_game_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" varchar(30),
	"bio" text,
	"country" varchar(2),
	"is_online" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"preferences" text DEFAULT '{"theme":"system","boardTheme":"classic","pieceSet":"standard","soundEnabled":true,"showCoordinates":true,"autoPromoteToQueen":false}',
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_player_id_users_id_fk" FOREIGN KEY ("white_player_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_player_id_users_id_fk" FOREIGN KEY ("black_player_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_game_stats" ADD CONSTRAINT "player_game_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_stats" ADD CONSTRAINT "user_daily_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "achievements_category_idx" ON "achievements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "friendships_requester_idx" ON "friendships" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "friendships_status_idx" ON "friendships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "game_moves_game_id_idx" ON "game_moves" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "game_moves_game_move_number_idx" ON "game_moves" USING btree ("game_id","move_number");--> statement-breakpoint
CREATE INDEX "games_white_player_idx" ON "games" USING btree ("white_player_id");--> statement-breakpoint
CREATE INDEX "games_black_player_idx" ON "games" USING btree ("black_player_id");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "games_result_idx" ON "games" USING btree ("result");--> statement-breakpoint
CREATE INDEX "games_game_type_idx" ON "games" USING btree ("game_type");--> statement-breakpoint
CREATE INDEX "games_timing_category_idx" ON "games" USING btree ("timing_category");--> statement-breakpoint
CREATE INDEX "games_created_at_idx" ON "games" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "games_status_created_at_idx" ON "games" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "player_game_stats_user_id_idx" ON "player_game_stats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "player_game_stats_game_id_idx" ON "player_game_stats" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "rating_history_user_id_idx" ON "rating_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rating_history_user_timing_idx" ON "rating_history" USING btree ("user_id","timing_category");--> statement-breakpoint
CREATE INDEX "rating_history_created_at_idx" ON "rating_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "user_achievements_user_id_idx" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_achievements_earned_at_idx" ON "user_achievements" USING btree ("earned_at");--> statement-breakpoint
CREATE INDEX "user_daily_stats_user_id_idx" ON "user_daily_stats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_daily_stats_date_idx" ON "user_daily_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "user_stats_rating_rapid_idx" ON "user_stats" USING btree ("rating_rapid");--> statement-breakpoint
CREATE INDEX "user_stats_rating_blitz_idx" ON "user_stats" USING btree ("rating_blitz");--> statement-breakpoint
CREATE INDEX "user_stats_rating_bullet_idx" ON "user_stats" USING btree ("rating_bullet");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_username_idx" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "users_is_online_idx" ON "users" USING btree ("is_online");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");