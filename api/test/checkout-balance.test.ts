/** FR-API-048: the wallet balance a checkout reads before the cap step (ADR 2026-09-07 add money). */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { api, resetDb, seedMerchant, type Fixture } from "./helpers";
import { setChainClient } from "../src/chain/relayer";
import { fakeChain } from "./fake-chain";
import { privyFixture } from "./privy-fixture";

let m: Fixture;
let chain: ReturnType<typeof fakeChain>;
let privy: Awaited<ReturnType<typeof privyFixture>>;
const subscriber = privateKeyToAccount(generatePrivateKey());
const identity = async (wallet = subscriber.address) => ({ "x-privy-token": await privy.token(wallet, { email: "sub@example.com" }) });

async function session(livemode: boolean) {
  const key = livemode ? m.skLive : m.skTest;
  const p = await api("POST", "/v1/products", { key, body: { name: "GPU", rate_usd_per_second: "0.004" } });
  const s = await api("POST", "/v1/checkout/sessions", { key, body: { product: p.body.id, success_url: "https://x.test/ok", cancel_url: "https://x.test/no" } });
  return s.body.id as string;
}

beforeEach(async () => {
  await resetDb();
  m = await seedMerchant();
  chain = fakeChain();
  setChainClient(chain.client);
  privy = await privyFixture();
  privy.use();
});
afterEach(() => {
  setChainClient(null);
  privy.off();
});

describe("FR-API-048 balance", () => {
  it("FR_API_048_a_live_session_reports_the_AUSD_balance_and_needs_funding_with_the_receiving_address", async () => {
    chain.balances.set(subscriber.address.toLowerCase(), 3_100_000n);
    const id = await session(true);
    const r = await api("GET", `/v1/checkout/sessions/${id}/balance`, { key: m.pkLive, headers: await identity() });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      balance_usd: "3.10",
      needs_funding: true,
      receive_address: subscriber.address.toLowerCase(),
      token: "AUSD",
      network: "Monad testnet",
      chain_id: 10143,
    });
  });

  it("FR_API_048_a_test_session_never_needs_funding", async () => {
    const id = await session(false);
    const r = await api("GET", `/v1/checkout/sessions/${id}/balance`, { key: m.pkTest, headers: await identity() });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ balance_usd: "0.00", needs_funding: false, token: "Test dollars", network: "Monad testnet" });
  });

  it("FR_API_048_needs_an_identity_token", async () => {
    const id = await session(true);
    const r = await api("GET", `/v1/checkout/sessions/${id}/balance`, { key: m.pkLive });
    expect(r.status).toBe(401);
  });
});
