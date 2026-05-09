-- Migration: Add role column to users table
-- Idempotent: safe to run multiple times

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- Promote the first registered user to admin
UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users);
