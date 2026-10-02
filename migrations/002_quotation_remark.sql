-- Convert existing item notes once. Re-running this migration must not restore
-- notes after a user intentionally clears or edits the overall remark.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='quotes' AND column_name='remark'
  ) THEN
    ALTER TABLE quotes ADD COLUMN remark TEXT NOT NULL DEFAULT '';
    UPDATE quotes q SET remark=notes.remark
    FROM (
      SELECT quote_id, string_agg(remark,E'\n' ORDER BY first_position) AS remark
      FROM (
        SELECT quote_id, BTRIM(remark) AS remark, MIN(position) AS first_position
        FROM quote_items
        WHERE BTRIM(COALESCE(remark,''))<>''
        GROUP BY quote_id,BTRIM(remark)
      ) distinct_notes
      GROUP BY quote_id
    ) notes
    WHERE q.id=notes.quote_id;
  END IF;
END $$;
