-- Migration 007: account type (client vs organization)

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'organization';
