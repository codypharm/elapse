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

/** Test mode (10143) escrows MockUSD; live (143) escrows AUSD (Undecided 4, decided 2026-09-05). */
export function escrowTokenFor(chainId: number): Address {
  const d = deploymentFor(chainId);
  return chainId === 143 ? d.ausd : d.mockUsd;
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
