// Temporary online database transfer. All application queries participate in the
// same advisory lock, including transactions on old instances during a rollout.
const LOCK = [1953526627, 20261030];
const tables = [
  ["salesmen", "id"], ["quote_sequences", "year"],
  ["quotes", "id"], ["quote_items", "id"]
];
const sequences = ["salesmen_id_seq", "quotes_id_seq", "quote_items_id_seq"];

async function snapshot(client) {
  const result = { tables: {}, sequences: {} };
  for (const [table, key] of tables) {
    const r = await client.query(`SELECT count(*)::int AS count,
      COALESCE(jsonb_agg(to_jsonb(t) ORDER BY ${key}), '[]'::jsonb)::text AS data
      FROM public.${table} t`);
    result.tables[table] = r.rows[0];
  }
  for (const sequence of sequences) {
    result.sequences[sequence] = (await client.query(
      `SELECT last_value::text, is_called FROM public.${sequence}`)).rows[0];
  }
  return result;
}

async function createStorageTransfer(source, target, migrationId) {
  if (!migrationId) throw new Error("MIGRATION_ID is required for an online transfer");
  await source.query(`CREATE TABLE IF NOT EXISTS public.quotation_storage_route (
    singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    destination text NOT NULL DEFAULT 'source' CHECK (destination IN ('source','target')),
    migration_id text NOT NULL
  )`);
  await source.query(`INSERT INTO public.quotation_storage_route(singleton,migration_id)
    VALUES(TRUE,$1) ON CONFLICT DO NOTHING`, [migrationId]);
  const readRoute = async client => {
    const row = (await client.query("SELECT destination,migration_id FROM public.quotation_storage_route WHERE singleton=TRUE")).rows[0];
    if (!row || row.migration_id !== migrationId) throw new Error("Storage transfer identity mismatch");
    return row.destination;
  };
  await readRoute(source);

  async function connect() {
    const gate = await source.connect();
    let selected;
    try {
      await gate.query("SELECT pg_advisory_lock_shared($1,$2)", LOCK);
      selected = await readRoute(gate) === "target" ? await target.connect() : gate;
    } catch (error) {
      // Destroying the connection releases any session lock even after errors.
      gate.release(true);
      throw error;
    }
    let released = false;
    return {
      query: (...args) => selected.query(...args),
      async release(error) {
        if (released) return;
        released = true;
        if (selected !== gate) selected.release(error);
        if (error) { gate.release(true); return; }
        try {
          await gate.query("SELECT pg_advisory_unlock_shared($1,$2)", LOCK);
          gate.release();
        } catch (_) { gate.release(true); }
      }
    };
  }
  const pool = {
    connect,
    async query(...args) {
      const client = await connect();
      try { return await client.query(...args); }
      finally { await client.release(); }
    }
  };

  async function transfer() {
    const from = await source.connect();
    let to, sourceTransaction = false, targetTransaction = false;
    try {
      // Requests wait on the database lock while the small, final copy commits.
      // The API continues accepting requests and no maintenance mode is enabled.
      await from.query("SELECT pg_advisory_lock($1,$2)", LOCK);
      if (await readRoute(from) === "target") return { alreadyTransferred: true };
      await from.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      sourceTransaction = true;
      await from.query("SET LOCAL TIME ZONE 'UTC'");
      const before = await snapshot(from);
      to = await target.connect();
      await to.query("BEGIN");
      targetTransaction = true;
      await to.query("SET LOCAL TIME ZONE 'UTC'");
      for (const [table] of tables) {
        if ((await to.query(`SELECT 1 FROM public.${table} LIMIT 1`)).rowCount) {
          throw new Error("Transfer requires an empty destination; source remains authoritative");
        }
      }
      for (const [table] of tables) {
        await to.query(`INSERT INTO public.${table} SELECT * FROM
          json_populate_recordset(NULL::public.${table},$1::json)`, [before.tables[table].data]);
      }
      for (const sequence of sequences) {
        const value = before.sequences[sequence];
        await to.query("SELECT setval($1::regclass,$2::bigint,$3)",
          [`public.${sequence}`, value.last_value, value.is_called]);
      }
      const after = await snapshot(to);
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Transfer verification failed");
      await to.query(`CREATE TABLE IF NOT EXISTS public.quotation_transfer_receipt (
        migration_id text PRIMARY KEY, copied_at timestamptz NOT NULL DEFAULT now(),
        verified_counts jsonb NOT NULL)`);
      const counts = Object.fromEntries(tables.map(([table]) => [table, before.tables[table].count]));
      await to.query("INSERT INTO public.quotation_transfer_receipt(migration_id,verified_counts) VALUES($1,$2)",
        [migrationId, JSON.stringify(counts)]);
      await to.query("COMMIT");
      targetTransaction = false;
      await from.query("UPDATE public.quotation_storage_route SET destination='target' WHERE singleton=TRUE");
      await from.query("COMMIT");
      sourceTransaction = false;
      return { verified: true, counts };
    } catch (error) {
      if (targetTransaction) await to.query("ROLLBACK").catch(() => {});
      if (sourceTransaction) await from.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      if (to) to.release();
      try { await from.query("SELECT pg_advisory_unlock($1,$2)", LOCK); from.release(); }
      catch (_) { from.release(true); }
    }
  }
  return { pool, transfer };
}

module.exports = { createStorageTransfer, snapshot };
