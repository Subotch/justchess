ALTER TABLE "users" ADD COLUMN "friend_code" varchar(8);

UPDATE "users"
SET "friend_code" = upper(substring(md5("id") from 1 for 8))
WHERE "friend_code" IS NULL;

ALTER TABLE "users" ALTER COLUMN "friend_code" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_friend_code_unique" UNIQUE("friend_code");
CREATE INDEX "users_friend_code_idx" ON "users" USING btree ("friend_code");
