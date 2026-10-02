# Coly Paint quotation app

Each quotation has one optional multiline **REMARK** field below its items table
for delivery MOQ and other overall notes (up to 10,000 characters). It is saved
with the quotation, returned by manager search and salesman history, and shown
below the table in the preview, manager details, and printed quotation.
Editing an approved quotation's remark creates a draft requiring approval again.

## Database migrations

The API runs the migrations during startup before accepting requests.
`001_item_remark.sql` retains the previous item field for older clients.
`002_quotation_remark.sql` adds `quotes.remark` and combines existing item notes
in item order, deduplicating identical notes. Original item records are preserved.
The conversion runs only when the new column is first added, so rerunning startup
never restores a remark that was intentionally cleared or overwrites an edit.

Older records without notes load blank. Old clients may still send item remarks;
the API combines them into an overall remark. Clients that omit all remarks when
editing a quotation preserve its existing overall note. An explicit empty overall
remark clears it. Failed database initialization prevents deployment of an API
with an incomplete schema.

## Verification

Install dependencies with `pnpm install`, then run `pnpm test` (or `npm test`).
Tests use an isolated PostgreSQL engine and a temporary local HTTP server to
exercise migration, save/edit/read APIs, manager filters, history, overall and legacy remarks,
and validation. UI tests cover loading, text escaping, quotation submission and
approval invalidation. No production database is used by the tests.

Print styles use A4 portrait, wrapped overall remarks, repeating table headers and
page breaks between item rows. The entry table scrolls horizontally on small
screens.
