/**
 * Relayer gas sample (worker FR-WRK-074). Each keeper tick records the relayer's native MON
 * balance so `GET /v1/status` (FR-API-075) can report burn and runway without touching the RPC
 * on a public request. A failed read is logged and skipped; the tick's settle work is unaffected.
 */
import { chainClient } from "../chain/relayer";
import { sql } from "../db/client";

export const SAMPLE_RETENTION_S = 7 * 86400;

export type SampleLogger = (e: Record<string, unknown>) => void;

/** Read the balance on `chainId` and store one row; prune rows older than the retention. */
export async function sampleRelayerBalance(chainId: number, now: number, log: SampleLogger): Promise<void> {
  const client = chainClient();
  let balance: bigint;
  try {
    balance = await client.readNativeBalance(chainId, client.address);
  } catch (e) {
    log({ relayer_balance: "read_failed", chain_id: chainId, error: (e as Error).message });
    return;
  }
  await sql`INSERT INTO relayer_balance_samples (chain_id, address, balance_wei, sampled_at)
            VALUES (${chainId}, ${client.address.toLowerCase()}, ${balance.toString()}::numeric, to_timestamp(${now}))`;
  await sql`DELETE FROM relayer_balance_samples WHERE sampled_at < to_timestamp(${now - SAMPLE_RETENTION_S})`;
}
