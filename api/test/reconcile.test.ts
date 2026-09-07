/**
 * FR-WRK-073: the platform reconciles a Subscription whose chain state diverged from its row by
 * pulling the stream's own logs through ingest. Nothing is written from view calls alone.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { sql } from "../src/db/client";
import { resetDb, seedMerchant, type Fixture } from "./helpers";
import { insertProduct } from "../src/db/products";
import { insertCustomer } from "../src/db/customers";
import { insertSubscription } from "../src/db/subscriptions";
import { setChainClient } from "../src/chain/relayer";
import { fakeChain } from "./fake-chain";
import { runReconcileOnce, ledgerFor } from "../src/worker/reconcile";
import { MERCHANT_ADDR, SUBSCRIBER, TREASURY } from "./ingest-fixtures";

let m: Fixture;
let chain: ReturnType<typeof fakeChain>;
const NOW = 1_757_000_000;
const STREAM = "0x00000000000000000000000000000000000000aa" as const;
const A = (s: string) => s as `0x${string}`;

async function activeStream(status = "active") {
  const product = await insertProduct({ merchantId: m.merchantId, livemode: false, name: "GPU", description: null, rateUsdPerSecond: "0.004", ratePerSecondWei: 4000n, allowPause: true });
  const customer = await insertCustomer({ merchantId: m.merchantId, livemode: false, walletAddress: SUBSCRIBER });
  const sub = await insertSubscription({ merchantId: m.merchantId, livemode: false, productId: product.id, customerId: customer.id, checkoutSessionId: null, chainId: 10143, ratePerSecondWei: 4000n, maxDurationSeconds: 300, maxEscrowWei: 1_200_000n, streamAddress: STREAM });
  await sql`UPDATE subscriptions SET status = ${status}, started_at = ${new Date((NOW - 10_000) * 1000)} WHERE id = ${sub.id}`;
  // the row's first known chain event, so reconcile knows where the stream's history starts
  await sql`INSERT INTO chain_events (id, chain_id, block_number, block_hash, block_timestamp, tx_hash, log_index, address, event_name, args, ledger, subscription_id)
            VALUES (DEFAULT, 10143, 60_005_680, '0xb1', ${NOW - 10_000}, '0xstart', 0, ${STREAM}, 'StreamStarted', '{}'::jsonb, '[]'::jsonb, ${sub.id})`;
  return sub.id;
}

beforeEach(async () => {
  await resetDb();
  m = await seedMerchant();
  chain = fakeChain();
  setChainClient(chain.client);
});
afterEach(() => setChainClient(null));

describe("FR-WRK-073 reconcile", () => {
  it("FR_WRK_073_ledger_rows_follow_the_indexer_rules", () => {
    const who = { merchant: A(MERCHANT_ADDR), subscriber: A(SUBSCRIBER), treasury: A(TREASURY) };
    expect(ledgerFor("Settled", { seconds: "300", amount: "1200000", fee: "12000" }, STREAM, who)).toEqual([
      { kind: "settlement", amount: "1188000", from: STREAM, to: MERCHANT_ADDR },
      { kind: "fee", amount: "12000", from: STREAM, to: TREASURY },
    ]);
    expect(ledgerFor("Settled", { seconds: "1", amount: "4000", fee: "0" }, STREAM, who)).toEqual([{ kind: "settlement", amount: "4000", from: STREAM, to: MERCHANT_ADDR }]);
    expect(ledgerFor("StreamCanceled", { at: "1", secondsElapsed: "300", amountSettled: "1200000", amountRefunded: "0" }, STREAM, who)).toEqual([]);
    expect(ledgerFor("StreamCanceled", { at: "1", secondsElapsed: "83", amountSettled: "332000", amountRefunded: "868000" }, STREAM, who)).toEqual([{ kind: "refund", amount: "868000", from: STREAM, to: SUBSCRIBER }]);
  });

  it("FR_WRK_073_a_row_active_while_the_chain_says_canceled_is_closed_through_ingest_once", async () => {
    const subId = await activeStream();
    chain.streamStates.set(STREAM, { status: 3, merchant: A(MERCHANT_ADDR), subscriber: A(SUBSCRIBER), treasury: A(TREASURY), settledSeconds: 300n });
    chain.streamLogs.set(STREAM, [
      { event_name: "Settled", args: { seconds: "300", amount: "1200000", fee: "12000" }, block_number: 60_443_287, block_hash: "0xb2", block_timestamp: NOW - 9_700, tx_hash: "0xcap", log_index: 0 },
      { event_name: "StreamCanceled", args: { at: String(NOW - 9_700), secondsElapsed: "300", amountSettled: "1200000", amountRefunded: "0" }, block_number: 60_443_287, block_hash: "0xb2", block_timestamp: NOW - 9_700, tx_hash: "0xcap", log_index: 1 },
    ]);
    const lines: Record<string, unknown>[] = [];
    const r = await runReconcileOnce({ now: NOW, log: (e) => lines.push(e) });
    expect(r).toMatchObject({ checked: 1, reconciled: [subId] });
    expect(chain.logQueries).toEqual([{ chainId: 10143, stream: STREAM, fromBlock: 60_005_680 }]);
    const [row] = await sql`SELECT status, ended_reason, settled_seconds FROM subscriptions WHERE id = ${subId}`;
    expect(row).toMatchObject({ status: "canceled", settled_seconds: 300 });
    // the paid settlement plus the zero invoice a cap end anchors `invoice.payment_failed` on (FR-API-051)
    const invoices = (await sql`SELECT status, seconds FROM invoices WHERE subscription_id = ${subId} ORDER BY seq`).map((r: Record<string, unknown>) => ({ status: r.status as string, seconds: r.seconds as number }));
    expect(invoices).toEqual([{ status: "paid", seconds: 300 }, { status: "failed", seconds: 0 }]);
    expect((await sql`SELECT type FROM events WHERE merchant_id = ${m.merchantId} ORDER BY created`).map((e: Record<string, unknown>) => e.type)).toEqual(expect.arrayContaining(["invoice.settled", "invoice.payment_failed", "subscription.canceled"]));
    expect(lines).toContainEqual({ reconciled: subId, logs: 2 });
    // second pass: nothing to do, nothing re-ingested
    const again = await runReconcileOnce({ now: NOW + 3600, log: () => {} });
    expect(again).toMatchObject({ checked: 0, reconciled: [] });
    expect(chain.logQueries).toHaveLength(1);
  });

  it("FR_WRK_073_a_stream_the_chain_still_calls_active_is_untouched_and_a_failed_read_is_logged", async () => {
    const subId = await activeStream();
    chain.streamStates.set(STREAM, { status: 1, merchant: A(MERCHANT_ADDR), subscriber: A(SUBSCRIBER), treasury: A(TREASURY), settledSeconds: 0n });
    expect(await runReconcileOnce({ now: NOW, log: () => {} })).toMatchObject({ checked: 1, reconciled: [] });
    expect(chain.logQueries).toEqual([]);
    chain.streamStates.set(STREAM, new Error("rpc down"));
    const lines: Record<string, unknown>[] = [];
    expect(await runReconcileOnce({ now: NOW, log: (e) => lines.push(e) })).toMatchObject({ checked: 1, reconciled: [] });
    expect(lines).toContainEqual({ stream: STREAM, reconcile_error: "rpc down" });
    expect((await sql`SELECT status FROM subscriptions WHERE id = ${subId}`)[0]!.status).toBe("active");
  });

  it("FR_WRK_073_only_specific_streams_when_asked", async () => {
    await activeStream();
    chain.streamStates.set(STREAM, { status: 1, merchant: A(MERCHANT_ADDR), subscriber: A(SUBSCRIBER), treasury: A(TREASURY), settledSeconds: 0n });
    expect(await runReconcileOnce({ now: NOW, only: ["0x00000000000000000000000000000000000000bb"], log: () => {} })).toMatchObject({ checked: 0 });
    expect(await runReconcileOnce({ now: NOW, only: [STREAM], log: () => {} })).toMatchObject({ checked: 1 });
  });
});
