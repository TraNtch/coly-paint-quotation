# Coly Paint quotation app

Each quotation item has an optional multiline **REMARK** field for delivery MOQ
and other notes (up to 1,000 characters). Remarks are saved with the item, returned
by manager search and salesman history, and shown in the quotation preview,
manager item details, and printed quotation. Adding a packing variant copies the
remark; it can then be edited independently. Editing an approved quotation's
remark creates a draft requiring approval again.

## Database migration

The API runs `migrations/001_item_remark.sql` during startup before accepting
requests. It adds `quote_items.remark` with a blank default and preserves existing
items. The migration can be run repeatedly. Older clients can omit the field, and
older records load with blank remarks. If database initialization fails, startup
fails so Render does not deploy an API with an incomplete schema.

## Verification

Install dependencies with `pnpm install`, then run `pnpm test` (or `npm test`).
Tests use an isolated PostgreSQL engine and a temporary local HTTP server to
exercise migration, save/edit/read APIs, manager filters, history, blank remarks,
and validation. UI tests cover loading, text escaping, packing variants and
approval invalidation. No production database is used by the tests.

Print styles use A4 portrait, wrapped remark cells, repeating table headers and
page breaks between item rows. The entry table scrolls horizontally on small
screens.
