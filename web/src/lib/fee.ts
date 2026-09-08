/**
 * The platform fee, read from the deployment record the API serves `fee_bps` from
 * (`deployments/10143.json`, copied by `pnpm sync-deployments`). The landing renders the
 * number from here and never types it into copy, so the page, the dashboard and the chain
 * cannot disagree (FR-LND-018). Split math mirrors `AccrualStream.settle`: the fee is
 * `amount × bps / 10 000` with integer division, so rounding favours the merchant.
 */
import record from "./deployments/10143.json";

export const FEE_BPS: number = record.feeBps;

/** "2 %" style figure for copy. */
export function feePercent(bps = FEE_BPS): string {
  return `${bps / 100} %`;
}

/** Split a settled amount (nano-dollars) into the merchant's share and the fee, both bigint. */
export function splitSettled(paidNano: bigint, bps = FEE_BPS): { merchant: bigint; fee: bigint } {
  const fee = (paidNano * BigInt(bps)) / 10_000n;
  return { merchant: paidNano - fee, fee };
}
