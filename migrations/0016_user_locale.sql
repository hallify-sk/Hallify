-- Each person's interface language, so emails go out in the language they read.
-- Emails were English-only because nothing recorded who reads Slovak. NULL means
-- "never chosen": the sender falls back to the organisation's default language and
-- then to Slovak. The app fills it in when someone picks a language (hooks.server.ts).
-- Additive and nullable: existing rows are untouched.
ALTER TABLE users ADD COLUMN locale TEXT CHECK (locale IS NULL OR locale IN ('sk', 'en'));

-- Email delivery health reads the newest log rows (latest attempt, latest failure).
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log (created_at);
