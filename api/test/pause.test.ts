/** FR-API-044..047: subscriber pause and resume as signed relays (ADR 2026-09-07 subscriber pause). */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { api, resetDb, seedMerchant, type Fixture } from "./helpers";
import { setChainClient } from "../src/chain/relayer";
import { fakeChain } from "./fake-chain";
import { STREAM, T0, streamCreated, deposited, streamStarted, streamPaused, streamResumed } from "./ingest-fixtures";
import { privyFixture } from "./privy-fixture";

let m: Fixture;
let chain: ReturnType<typeof fakeChain>;
let privy: Awaited<ReturnType<typeof privyFixture>>;
const subscriber = privateKeyToAccount(generatePrivateKey());
const INGEST = { authorization: "Bearer ingest-test-token" };
const identity = async (wallet = subscriber.address) => ({ "x-privy-token": await privy.token(wallet, { email: "sub@example.com" }) });

/** A started meter on a product that may or may not allow pause. */
async function liveSession(allowPause: boolean, stream = STREAM) {
  const p = await api("POST", "/v1/products", { key: m.skTest, body: { name: "GPU", rate_usd_per_second: "0.004", allow_pause: allowPause } });
  const s = await api("POST", "/v1/checkout/sessions", { key: m.skTest, body: { product: p.body.id, success_url: "https://x.test/ok", cancel_url: "https://x.test/no" } });
  const prep = await api("POST", `/v1/checkout/sessions/${s.body.id}/prepare`, { key: m.pkTest, body: { max_duration_seconds: 3600 }, headers: await identity() });
  const signature = await subscriber.signTypedData({ domain: prep.body.permit.domain, types: prep.body.permit.types, primaryType: "Permit", message: { owner: prep.body.permit.message.owner, spender: prep.body.permit.message.spender, value: BigInt(prep.body.permit.message.value), nonce: BigInt(prep.body.permit.message.nonce), deadline: BigInt(prep.body.permit.message.deadline) } });
  const start = await api("POST", `/v1/checkout/sessions/${s.body.id}/start`, { key: m.pkTest, body: { signature } });
  if (start.status !== 202) throw new Error(`start failed: ${JSON.stringify(start.body)}`);
  const tx: string = start.body.pending_tx;
  const created = streamCreated(tx);
  await api("POST", "/internal/ingest", { headers: INGEST, body: { ...created, args: { ...created.args, stream, subscriber: subscriber.address.toLowerCase() } } });
  await api("POST", "/internal/ingest", { headers: INGEST, body: { ...deposited(tx), address: stream } });
  await api("POST", "/internal/ingest", { headers: INGEST, body: { ...streamStarted(tx), address: stream } });
  return { sessionId: s.body.id as string, subId: prep.body.subscription as string, stream };
}

/** Prepare, sign, submit one relayed action; returns the submit response. */
async function relay(base: string, action: "pause" | "resume", wallet = subscriber) {
  const prep = await api("POST", `${base}/${action}/prepare`, { key: m.pkTest, body: {}, headers: await identity(wallet.address) });
  if (prep.status !== 200) return prep;
  const signature = await wallet.signMessage({ message: { raw: prep.body.message } });
  return api("POST", `${base}/${action}`, { key: m.pkTest, body: { signature, deadline: prep.body.deadline }, headers: await identity(wallet.address) });
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

describe("FR-API-044/045 pause and resume under the session", () => {
  it("FR_API_044_pause_prepare_returns_the_message_then_pause_submits_pauseFor_and_resume_submits_resumeFor", async () => {
    const { sessionId, subId } = await liveSession(true);
    const base = `/v1/checkout/sessions/${sessionId}`;
    const prep = await api("POST", `${base}/pause/prepare`, { key: m.pkTest, body: {}, headers: await identity() });
    expect(prep.status).toBe(200);
    expect(prep.body).toMatchObject({ subscription: subId, stream_address: STREAM, chain_id: 10143, nonce: "0" });
    expect(prep.body.message).toMatch(/^0x[0-9a-f]{64}$/);

    const signature = await subscriber.signMessage({ message: { raw: prep.body.message } });
    const res = await api("POST", `${base}/pause`, { key: m.pkTest, body: { signature, deadline: prep.body.deadline } });
    expect(res.status).toBe(202);
    expect(res.body.pending_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.pauses).toEqual([{ stream: STREAM, deadline: BigInt(prep.body.deadline), signature }]);
    expect(chain.cancels).toHaveLength(0);
    // Status is still active until StreamPaused is ingested (BR-API-005).
    expect((await api("GET", base, { key: m.pkTest })).body.subscription.status).toBe("active");

    // Only a paused meter can resume (FR-API-045).
    const early = await relay(base, "resume");
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe("invalid_state");

    await api("POST", "/internal/ingest", { headers: INGEST, body: streamPaused(T0 + 30) });
    expect((await api("GET", base, { key: m.pkTest })).body.subscription.status).toBe("paused");
    const resumed = await relay(base, "resume");
    expect(resumed.status).toBe(202);
    expect(chain.resumes).toHaveLength(1);
    expect(chain.resumes[0]!.deadline).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
    // The shared relay nonce moved twice.
    expect(await chain.client.readRelayNonce(10143, STREAM)).toBe(2n);
  });
});

describe("FR-API-044 pause needs allow_pause", () => {
  it("FR_API_044_pause_on_a_product_without_allow_pause_is_400_and_never_reaches_the_chain", async () => {
    const { sessionId } = await liveSession(false);
    const res = await relay(`/v1/checkout/sessions/${sessionId}`, "pause");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("pause_not_allowed");
    expect(chain.pauses).toHaveLength(0);
  });

  it("FR_API_044_a_pause_signature_from_a_stranger_is_400", async () => {
    const { sessionId } = await liveSession(true);
    const base = `/v1/checkout/sessions/${sessionId}`;
    const prep = await api("POST", `${base}/pause/prepare`, { key: m.pkTest, body: {}, headers: await identity() });
    const stranger = privateKeyToAccount(generatePrivateKey());
    const signature = await stranger.signMessage({ message: { raw: prep.body.message } });
    const res = await api("POST", `${base}/pause`, { key: m.pkTest, body: { signature, deadline: prep.body.deadline } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("bad_signature");
    expect(chain.pauses).toHaveLength(0);
  });
});

describe("FR-API-047 pause/resume rate limit", () => {
  it("FR_API_047_the_eleventh_pause_or_resume_in_an_hour_is_429_and_prepare_calls_do_not_count", async () => {
    const { sessionId } = await liveSession(true);
    const base = `/v1/checkout/sessions/${sessionId}`;
    // Prepare freely: only submissions count.
    for (let i = 0; i < 12; i++) expect((await api("POST", `${base}/pause/prepare`, { key: m.pkTest, body: {}, headers: await identity() })).status).toBe(200);
    for (let i = 0; i < 5; i++) {
      expect((await relay(base, "pause")).status).toBe(202);
      await api("POST", "/internal/ingest", { headers: INGEST, body: streamPaused(T0 + 10 + i * 20) });
      expect((await relay(base, "resume")).status).toBe(202);
      await api("POST", "/internal/ingest", { headers: INGEST, body: streamResumed(T0 + 20 + i * 20) });
    }
    const eleventh = await relay(base, "pause");
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error).toMatchObject({ type: "rate_limit_error", code: "rate_limited" });
    expect(chain.pauses).toHaveLength(5);
    // Stop is never rate limited.
    expect((await relay(base, "cancel" as never)).status).toBe(202);
  });
});

describe("FR-API-046 pause and resume from the account", () => {
  it("FR_API_046_account_rows_carry_allow_pause_and_the_account_routes_relay_for_the_callers_own_subscription", async () => {
    const { subId } = await liveSession(true);
    const list = await api("GET", "/v1/account/subscriptions", { headers: await identity() });
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ id: subId, product: { allow_pause: true } });

    const base = `/v1/account/subscriptions/${subId}`;
    const paused = await relay(base, "pause");
    expect(paused.status).toBe(202);
    expect(chain.pauses).toHaveLength(1);
    await api("POST", "/internal/ingest", { headers: INGEST, body: streamPaused(T0 + 30) });
    expect((await relay(base, "resume")).status).toBe(202);
    expect(chain.resumes).toHaveLength(1);
  });

  it("FR_API_046_another_wallets_subscription_is_404", async () => {
    const { subId } = await liveSession(true);
    const other = privateKeyToAccount(generatePrivateKey());
    const res = await relay(`/v1/account/subscriptions/${subId}`, "pause", other);
    expect(res.status).toBe(404);
    expect(chain.pauses).toHaveLength(0);
  });
});
