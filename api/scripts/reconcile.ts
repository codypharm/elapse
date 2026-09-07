/**
 * `bun run reconcile` (FR-WRK-073): one reconcile pass, then exit 0 with the count. Safe to run
 * any time; ingest is idempotent. Needs the relayer env for the RPC (read-only calls).
 */
import { runReconcileOnce } from "../src/worker/reconcile";

const r = await runReconcileOnce();
console.log(`reconcile: checked ${r.checked}, reconciled ${r.reconciled.length}${r.reconciled.length ? ` (${r.reconciled.join(", ")})` : ""}`);
process.exit(0);
