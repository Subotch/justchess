-- Migration: preferences field text → jsonb
-- Generated for: src/db/schema.ts PreferencesData

ALTER TABLE "users"
  ALTER COLUMN "preferences" TYPE jsonb
  USING "preferences"::jsonb;

ALTER TABLE "users"
  ALTER COLUMN "preferences" SET DEFAULT '{"theme":"system","boardTheme":"classic","pieceSet":"standard","soundEnabled":true,"showCoordinates":true,"autoPromoteToQueen":false}'::jsonb;
