-- The assistant can look at drawings: images and PDFs, uploaded or found on the web.
--
-- Text attachments (CSV, TXT) keep living inline in `content`. Binary ones are kept
-- in R2 under ai-documents/ — a prefix the public /uploads route never serves — and
-- only referenced here, so a conversation's rows stay small and a floor plan PDF is
-- read from storage when the model needs it, not copied into every replayed turn.
ALTER TABLE ai_attachments ADD COLUMN mime TEXT;
ALTER TABLE ai_attachments ADD COLUMN r2_key TEXT;
-- Pages, for a PDF; so the assistant can be told how big a document is before it asks for it.
ALTER TABLE ai_attachments ADD COLUMN page_count INTEGER;
