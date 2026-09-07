/**
 * Reconcile (FR-WRK-073): a Subscription whose chain state diverged from its row is closed by
 * pulling the stream's own `Settled` / `StreamCanceled` logs and running them through the same
 * ingest path the indexer uses. Ingest is idempotent on `txHash + logIndex`, so the Events,
 * Invoices, ledger rows and webhook deliveries come out exactly as the indexer would have
 * produced them; nothing is written from view calls alone. Covers streams the indexer never
 * saw (an older factory) and any log it dropped. Runs hourly in the worker, on demand from the
 * keeper's skips (FR-WRK-072), and once from `bun run reconcile`.
 */
import type { Address } from "viem";
import { sql } from "../db/client";
import { ingestChainEvent, type IngestBody } from "../db/ingest";
import { chainClient, type StreamState } from "../chain/relayer";
import { sleep } from "./sleep";

export const RECONCILE_INTERVAL_S = Number(process.env.RECONCILE_INTERVAL_S ?? 3600);
const POLL_MS = 30_000;
const CANCELED = 3;

export type ReconcileLogger = (entry: Record<string, unknown>) => void;

/** Streams the keeper could not settle; the next reconcile poll takes them regardless of the interval. */
const requested = new Set<string>();
export function requestReconcile(stream: string): void {
  requested.add(stream.toLowerCase());
}

/** Ledger rows for one log, by the indexer's rules (FR-IDX-014): zero-amount fee and refund rows are not written. */
export function ledgerFor(eventName: string, args: Record<string, string>, stream: string, who: Pick<StreamState, "merchant" | "subscriber" | "treasury">): IngestBody["ledger"] {
  if (eventName === "Settled") {
    const amount = BigInt(args.amount ?? "0");
    const fee = BigInt(args.fee ?? "0");
    const rows: IngestBody["ledger"] = [{ kind: "settlement", amount: (amount - fee).toString(), from: stream, to: who.merchant }];
    if (fee > 0n) rows.push({ kind: "fee", amount: fee.toString(), from: stream, to: who.treasury });
    return rows;
  }
  if (eventName === "StreamCanceled") {
    const refund = BigInt(args.amountRefunded ?? "0");
    return refund > 0n ? [{ kind: "refund", amount: refund.toString(), from: stream, to: who.subscriber }] : [];
  }
  return [];
}

interface Candidate {
  id: string;
  chain_id: number;
  stream_address: string;
  from_block: number | null;
}

export async function runReconcileOnce(o: { now?: number; only?: string[]; log?: ReconcileLogger | undefined } = {}): Promise<{ checked: number; reconciled: string[] }> {
  const log = o.log ?? ((e) => console.log(JSON.stringify({ at: new Date().toISOString(), reconcile: true, ...e })));
  const only = o.only?.map((s) => s.toLowerCase()) ?? null;
  const rows = (await sql`
    SELECT s.id, s.chain_id, s.stream_address, (SELECT min(block_number) FROM chain_events c WHERE c.subscription_id = s.id) AS from_block
    FROM subscriptions s
    WHERE s.status IN ('active', 'paused') AND s.stream_address IS NOT NULL
      ${only ? sql`AND lower(s.stream_address) = ANY(${sql.array(only, "TEXT")})` : sql``}
    ORDER BY s.started_at`) as Candidate[];
  const reconciled: string[] = [];
  for (const row of rows) {
    const stream = row.stream_address.toLowerCase() as Address;
    try {
      const state = await chainClient().readStreamState(row.chain_id, stream);
      if (state.status !== CANCELED) continue;
      if (row.from_block === null) {
        log({ stream, reconcile_error: "no chain event on record; cannot bound the log query" });
        continue;
      }
      const logs = await chainClient().readStreamLogs(row.chain_id, stream, BigInt(row.from_block), { settledSeconds: state.settledSeconds });
      for (const l of logs) {
        await ingestChainEvent({ chain_id: row.chain_id, address: stream, ledger: ledgerFor(l.event_name, l.args, stream, state), ...l });
      }
      reconciled.push(row.id);
      log({ reconciled: row.id, logs: logs.length });
    } catch (e) {
      log({ stream, reconcile_error: (e as Error).message });
    }
  }
  return { checked: rows.length, reconciled };
}

/** Full pass every `RECONCILE_INTERVAL_S`; a keeper-requested stream on the next 30 s poll. */
export async function reconcileForever(signal?: AbortSignal, log?: ReconcileLogger): Promise<void> {
  let lastFull = 0;
  while (!signal?.aborted) {
    try {
      const now = Math.floor(Date.now() / 1000);
      if (now - lastFull >= RECONCILE_INTERVAL_S) {
        lastFull = now;
        requested.clear();
        await runReconcileOnce({ now, log });
      } else if (requested.size > 0) {
        const only = [...requested];
        requested.clear();
        await runReconcileOnce({ now, only, log });
      }
    } catch (e) {
      console.error("reconcile tick crashed", { message: (e as Error).message });
    }
    await sleep(POLL_MS, signal);
  }
}
