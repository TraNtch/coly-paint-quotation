-- Safe to run on existing databases and on every API startup.
-- Existing quotation items receive a blank remark.
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS remark TEXT NOT NULL DEFAULT '';
