-- Add 'friendly' value to game_type enum
ALTER TYPE "public"."game_type" ADD VALUE IF NOT EXISTS 'friendly';
