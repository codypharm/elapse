/**
 * Relayer runway (FR-API-075) from the worker's gas samples (FR-WRK-074). Pure arithmetic over
 * the newest sample and the oldest sample within the last hour; the RPC is never touched here.
 */
import { sql } from "./client";

export const RELAYER_LOW_HOURS = Number(process.env.RELAYER_LOW_HOURS ?? 24);
export const RELAYER_LOW_MON = Number(process.env.RELAYER_LOW_MON ?? 1);
/** A sample older than this is reported `stale`; `low` is still judged from it. */
export const RELAYER_STALE_S = 120;
const WEI = 1_000_000_000_000_000_000n;

export interface RelayerRunway {
  address: string | null;
  balance_mon: string | null;
  sampled_at: number | null;
  burn_mon_per_hour: number | null;
  hours_left: number | null;
  low: boolean;
  stale: boolean;
}

interface SampleRow { address: string; balance_wei: string; at: string }

/** Wei → decimal MON string with trailing zeros trimmed ("4.64", "20"). */
export function formatMon(wei: bigint): string {
  const whole = wei / WEI;
  const frac = (wei % WEI).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function computeRunway(newest: SampleRow | undefined, oldestInHour: SampleRow | undefined, now: number): RelayerRunway {
  if (!newest) return { address: null, balance_mon: null, sampled_at: null, burn_mon_per_hour: null, hours_left: null, low: false, stale: true };
  const balanceWei = BigInt(newest.balance_wei);
  const balance = Number(balanceWei) / 1e18;
  const sampledAt = Number(newest.at);
  let burn: number | null = null;
  if (oldestInHour && Number(oldestInHour.at) < sampledAt) {
    const drop = Number(BigInt(oldestInHour.balance_wei) - balanceWei) / 1e18;
    const span = sampledAt - Number(oldestInHour.at);
    burn = drop > 0 ? (drop * 3600) / span : null;
  }
  const hoursLeft = burn ? balance / burn : null;
  return {
    address: newest.address,
    balance_mon: formatMon(balanceWei),
    sampled_at: sampledAt,
    burn_mon_per_hour: burn,
    hours_left: hoursLeft,
    low: (hoursLeft !== null && hoursLeft < RELAYER_LOW_HOURS) || balance < RELAYER_LOW_MON,
    stale: now - sampledAt > RELAYER_STALE_S,
  };
}

export async function relayerRunway(chainId: number, now = Math.floor(Date.now() / 1000)): Promise<RelayerRunway> {
  const cols = sql`address, balance_wei::text AS balance_wei, extract(epoch FROM sampled_at)::bigint::text AS at`;
  const [newest] = (await sql`SELECT ${cols} FROM relayer_balance_samples WHERE chain_id = ${chainId} ORDER BY sampled_at DESC, id DESC LIMIT 1`) as SampleRow[];
  const [oldest] = (await sql`SELECT ${cols} FROM relayer_balance_samples WHERE chain_id = ${chainId} AND sampled_at >= to_timestamp(${now - 3600})
                              ORDER BY sampled_at ASC, id ASC LIMIT 1`) as SampleRow[];
  return computeRunway(newest, oldest, now);
}
