-- Migration 0018b — team chat attachments.
--
-- Team channel messages could carry text only. These columns mirror the ones on
-- `messages` (client threads); uploads go through /api/upload/image, so the URL is
-- always a same-origin /uploads/… path. Additive; existing rows keep NULL.

ALTER TABLE channel_messages ADD COLUMN attachment_url TEXT;
ALTER TABLE channel_messages ADD COLUMN attachment_name TEXT;
ALTER TABLE channel_messages ADD COLUMN attachment_type TEXT;
