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
  deployedAtBlock: number;
}

const byChain: Record<number, Deployment> = { 10143: testnet as Deployment };

export function deploymentFor(chainId: number): Deployment {
  const d = byChain[chainId];
  if (!d) throw new Error(`No deployment record for chain ${chainId}`);
  return d;
}

/**
 * The token escrowed on a chain: always the chain record's AUSD, in both modes
 * (ADR 2026-09-13 AUSD only). Mode maps to chain, never to token.
 */
export function escrowTokenFor(chainId: number): Address {
  return deploymentFor(chainId).ausd;
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
