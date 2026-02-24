-- Migration: Add Custom OpenAI-compatible Provider Support
-- Description: Adds columns to store custom OpenAI-compatible endpoint configuration
-- Date: 2026-02-23

-- Add custom_openai_endpoint column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_settings'
        AND column_name = 'custom_openai_endpoint'
    ) THEN
        ALTER TABLE user_settings ADD COLUMN custom_openai_endpoint TEXT DEFAULT NULL;
    END IF;
END $$;

-- Add custom_openai_key column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_settings'
        AND column_name = 'custom_openai_key'
    ) THEN
        ALTER TABLE user_settings ADD COLUMN custom_openai_key TEXT DEFAULT NULL;
    END IF;
END $$;
