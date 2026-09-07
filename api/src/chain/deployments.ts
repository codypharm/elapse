/** Per-chain deployment record from `contracts/deployments/<chainId>.json`, copied by `pnpm sync-deployments`. */
import testnet from "../../deployments/10143.json" with { type: "json" };
import type { Address } from "viem";

export interface Deployment {
  chainId: number;
  factory: Address;
  implementation: Address;
  treasury: Address;
  feeBps: number;
  ausd: Address;
  ausdDecimals: number;
  mockUsd: Address;
  deployedAtBlock: number;
}

const byChain: Record<number, Deployment> = { 10143: testnet as Deployment };

export function deploymentFor(chainId: number): Deployment {
  const d = byChain[chainId];
  if (!d) throw new Error(`No deployment record for chain ${chainId}`);
  return d;
}

/**
 * The token a mode escrows on a chain: live mode escrows AUSD, test mode MockUSD, on whichever
 * chain the mode runs (ADR 2026-09-07 add money: both modes on 10143 until mainnet, live on
 * AUSD there too). Mainnet has no MockUSD, so it is AUSD in both modes.
 */
export function escrowTokenFor(chainId: number, livemode: boolean): Address {
  const d = deploymentFor(chainId);
  if (chainId === 143) return d.ausd;
  return livemode ? d.ausd : d.mockUsd;
}

/** Whether the relayer may mint the escrow token to a short wallet: true only for MockUSD (FR-API-032/034). Keyed by token, not mode: live mode runs on 10143 until a mainnet record exists (ADR 2026-09-07 testnet submission). */
export function isMintable(chainId: number, token: Address): boolean {
  return token.toLowerCase() === deploymentFor(chainId).mockUsd.toLowerCase();
}

/**
 * Add or replace a chain's record at runtime; returns a function that restores the previous
 * state. Test seam for chains without a committed record (a mainnet record is a JSON file,
 * never registered here in production).
 */
export function registerDeployment(d: Deployment): () => void {
  const previous = byChain[d.chainId];
  byChain[d.chainId] = d;
  return () => {
    if (previous) byChain[d.chainId] = previous;
    else delete byChain[d.chainId];
  };
}
