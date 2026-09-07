/**
 * Process configuration, read once. Everything here is non-secret or a
 * reference to a secret held in the environment; nothing is logged.
 * Test mode = Monad testnet 10143 with MockUSD. Live mode is 10143 too until a mainnet record exists
 * (ADR 2026-09-07 testnet submission); it becomes 143 with AUSD when `deployments/143.json` lands.
 */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  /** AUSD and MockUSD are both 6-decimal tokens (contracts README, Tokens table). */
  tokenDecimals: Number(process.env.TOKEN_DECIMALS ?? 6),
  chains: {
    test: 10143,
    live: Number(process.env.LIVE_CHAIN_ID ?? 10143),
  },
  checkoutBaseUrl: process.env.NEXT_PUBLIC_CHECKOUT_URL ?? "http://localhost:3000",
  /** Where the dashboard is served; magic links point here and it is the only Origin allowed to mutate with a cookie (FR-API-101). */
  dashboardOrigin: (process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000").replace(/\/+$/, ""),
  email: {
    from: process.env.EMAIL_FROM ?? "Elapse <no-reply@elapse.finance>",
  },
  publicApiUrl: (process.env.PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
  /** The docs site, whose API reference calls public routes from the browser with a test key (FR-API-086). Unset = no CORS. */
  docsOrigin: (process.env.DOCS_ORIGIN ?? "").replace(/\/+$/, ""),
  /** Privy app for subscriber identity tokens (FR-API-120); both unset = prepare answers 503 (FR-API-125). The key is PEM, possibly with literal \n. */
  privyAppId: process.env.PRIVY_APP_ID ?? "",
  privyVerificationKey: (process.env.PRIVY_VERIFICATION_KEY ?? "").replace(/\\n/g, "\n"),
  /** Where merchants reach this API; goes into the public OpenAPI file's `servers` (FR-API-085). */
  /** Shared secret the indexer presents on `POST /internal/ingest` (FR-API-070). Unset = route refuses everything. */
  ingestToken: process.env.INGEST_TOKEN ?? "",
} as const;

export function chainIdFor(livemode: boolean): number {
  return livemode ? config.chains.live : config.chains.test;
}
