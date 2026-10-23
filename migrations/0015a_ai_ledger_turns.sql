-- 0015a: tie each AI charge to the question it answered.
--
-- One question can take several model calls (tool use, web search); the credit
-- activity on the AI settings page groups them back into one row per question and
-- links to the conversation. Additive: older charges keep NULLs and show one row
-- per call, as before.
ALTER TABLE ai_ledger ADD COLUMN thread_id TEXT;
ALTER TABLE ai_ledger ADD COLUMN turn_id TEXT;
CREATE INDEX IF NOT EXISTS idx_ai_ledger_turn ON ai_ledger(org_id, turn_id);
