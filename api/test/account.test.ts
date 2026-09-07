import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { api, resetDb, seedMerchant, type Fixture } from "./helpers";
import { setChainClient } from "../src/chain/relayer";
import { fakeChain } from "./fake-chain";
import { STREAM, T0, streamCreated, deposited, streamStarted, settled, streamCanceled } from "./ingest-fixtures";
import { privyFixture } from "./privy-fixture";
import { setMailer, type Mail } from "../src/lib/email";
import { config } from "../src/config";

let m: Fixture;
let chain: ReturnType<typeof fakeChain>;
const subscriber = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
let privy: Awaited<ReturnType<typeof privyFixture>>;
const identity = async (wallet = subscriber.address, email?: string) => ({ "x-privy-token": await privy.token(wallet, email ? { email } : {}), origin: config.checkoutBaseUrl });
const INGEST = { authorization: "Bearer ingest-test-token" };
let mails: Mail[] = [];

/** A live stream for `wallet` on merchant `f`: prepare, start, ingest the start logs. */
async function liveSession(f: Fixture, wallet = subscriber, productName = "GPU", stream = STREAM) {
  const p = await api("POST", "/v1/products", { key: f.skTest, body: { name: productName, rate_usd_per_second: "0.004" } });
  const s = await api("POST", "/v1/checkout/sessions", { key: f.skTest, body: { product: p.body.id, success_url: "https://x.test/ok", cancel_url: "https://x.test/no" } });
  const prep = await api("POST", `/v1/checkout/sessions/${s.body.id}/prepare`, { key: f.pkTest, body: { max_duration_seconds: 3600 }, headers: { "x-privy-token": await privy.token(wallet.address, { email: "sub@example.com" }) } });
  const signature = await wallet.signTypedData({ domain: prep.body.permit.domain, types: prep.body.permit.types, primaryType: "Permit", message: { owner: prep.body.permit.message.owner, spender: prep.body.permit.message.spender, value: BigInt(prep.body.permit.message.value), nonce: BigInt(prep.body.permit.message.nonce), deadline: BigInt(prep.body.permit.message.deadline) } });
  const start = await api("POST", `/v1/checkout/sessions/${s.body.id}/start`, { key: f.pkTest, body: { signature } });
  if (start.status !== 202) throw new Error(`start failed: ${JSON.stringify(start.body)}`);
  const tx: string = start.body.pending_tx;
  const created = streamCreated(tx);
  await api("POST", "/internal/ingest", { headers: INGEST, body: { ...created, address: created.address, args: { ...created.args, stream, subscriber: wallet.address.toLowerCase() } } });
  await api("POST", "/internal/ingest", { headers: INGEST, body: { ...deposited(tx), address: stream } });
  await api("POST", "/internal/ingest", { headers: INGEST, body: { ...streamStarted(tx), address: stream } });
  return { sessionId: s.body.id as string, subId: prep.body.subscription as string, stream };
}

beforeEach(async () => {
  await resetDb();
  m = await seedMerchant();
  chain = fakeChain();
  setChainClient(chain.client);
  privy = await privyFixture();
  privy.use();
  mails = [];
  setMailer(async (mail) => {
    mails.push(mail);
  });
});
afterEach(() => {
  setChainClient(null);
  privy.off();
  setMailer(null);
});

describe("FR-API-121 account subscriptions", () => {
  it("FR_API_121_lists_the_callers_meters_across_merchants_with_public_branding_and_livemode_never_another_wallets", async () => {
    const { subId } = await liveSession(m);
    const other = await seedMerchant("other@acme.test");
    const second = await liveSession(other, subscriber, "Transcribe", "0x00000000000000000000000000000000000000a2");
    await liveSession(m, stranger, "GPU", "0x00000000000000000000000000000000000000a3");
    const r = await api("GET", "/v1/account/subscriptions", { headers: await identity() });
    expect(r.status).toBe(200);
    expect(r.body.object).toBe("list");
    expect(r.body.data.map((s: any) => s.id).sort()).toEqual([subId, second.subId].sort());
    const row = r.body.data.find((s: any) => s.id === subId);
    expect(row).toMatchObject({ status: "active", livemode: false, product: { name: "GPU", rate_usd_per_second: "0.004" }, max_duration_seconds: 3600, funded_usd: "14.4", settled_usd: "0", refunded_usd: "0", ended_reason: null });
    expect(row.merchant).toEqual({ name: "Acme GPU", logo_url: null, support_url: null });
    expect(typeof row.started_at).toBe("number");
    expect(row.checkout_session).toMatch(/^cs_/);
    expect(typeof row.seconds_elapsed).toBe("number");
    // never keys, endpoints, payout addresses, wallets or stream addresses
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/sk_|whsec_|payout|wallet_address|stream_address|0x[0-9a-fA-F]{40}/);
    // the stranger sees only their own
    const s = await api("GET", "/v1/account/subscriptions", { headers: await identity(stranger.address) });
    expect(s.body.data).toHaveLength(1);
    expect(s.body.data[0].id).not.toBe(subId);
  });

  it("FR_API_121_status_filters_and_a_canceled_meter_carries_its_receipt_figures", async () => {
    const { subId, stream } = await liveSession(m);
    const cancelTx = "0x" + "c".repeat(64);
    await api("POST", "/internal/ingest", { headers: INGEST, body: { ...settled(220, "880000", "8800", T0 + 220, cancelTx), address: stream } });
    await api("POST", "/internal/ingest", { headers: INGEST, body: { ...streamCanceled(T0 + 220, 220, "880000", "13520000", cancelTx), address: stream } });
    const all = await api("GET", "/v1/account/subscriptions", { headers: await identity() });
    expect(all.body.data.map((s: any) => s.status)).toEqual(["canceled"]);
    expect(all.body.data[0]).toMatchObject({ id: subId, seconds_elapsed: 220, settled_usd: "0.88", refunded_usd: "13.52", ended_reason: "canceled" });
    expect(typeof all.body.data[0].canceled_at).toBe("number");
    const running = await api("GET", "/v1/account/subscriptions?status=active,paused", { headers: await identity() });
    expect(running.body.data).toEqual([]);
    const bad = await api("GET", "/v1/account/subscriptions?status=incomplete", { headers: await identity() });
    expect(bad.status).toBe(400);
  });

  it("FR_API_121_needs_an_identity_token", async () => {
    expect((await api("GET", "/v1/account/subscriptions")).status).toBe(401);
  });
});

describe("FR-API-123 account cancel", () => {
  it("FR_API_123_cancel_prepare_then_cancel_submits_cancelFor_for_the_callers_meter_only", async () => {
    const { subId } = await liveSession(m);
    chain.setRelayNonce(STREAM, 0n);
    const prep = await api("POST", `/v1/account/subscriptions/${subId}/cancel/prepare`, { body: {}, headers: await identity() });
    expect(prep.status).toBe(200);
    expect(prep.body).toMatchObject({ subscription: subId, chain_id: 10143, nonce: "0" });
    expect(prep.body.message).toMatch(/^0x[0-9a-f]{64}$/);
    const signature = await subscriber.signMessage({ message: { raw: prep.body.message } });
    const res = await api("POST", `/v1/account/subscriptions/${subId}/cancel`, { body: { signature, deadline: prep.body.deadline }, headers: await identity() });
    expect(res.status).toBe(202);
    expect(res.body.pending_tx).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.cancels).toHaveLength(1);
    // another wallet cannot even see it
    const s = await api("POST", `/v1/account/subscriptions/${subId}/cancel/prepare`, { body: {}, headers: await identity(stranger.address) });
    expect(s.status).toBe(404);
  });
});

describe("FR-API-123 receipt email", () => {
  it("FR_CHK_029_a_canceled_meter_is_emailed_to_the_identity_once_per_10_minutes_with_no_fee_and_no_chain_words", async () => {
    const { subId, stream } = await liveSession(m);
    const running = await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity(subscriber.address, "sub@example.com") });
    expect(running.status).toBe(400);
    const cancelTx = "0x" + "c".repeat(64);
    await api("POST", "/internal/ingest", { headers: INGEST, body: { ...settled(220, "880000", "8800", T0 + 220, cancelTx), address: stream } });
    await api("POST", "/internal/ingest", { headers: INGEST, body: { ...streamCanceled(T0 + 220, 220, "880000", "13520000", cancelTx), address: stream } });
    const r = await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity(subscriber.address, "sub@example.com") });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ sent: true });
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("sub@example.com");
    expect(mails[0]!.subject).toContain("Acme GPU");
    expect(mails[0]!.text).toContain("You paid for 220 seconds · $0.88");
    expect(mails[0]!.text).toContain("$13.52");
    expect(mails[0]!.text).toContain("GPU");
    expect(mails[0]!.text.toLowerCase()).not.toMatch(/fee|wallet|chain|tx|0x/);
    const again = await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity(subscriber.address, "sub@example.com") });
    expect(again.status).toBe(429);
    expect(mails).toHaveLength(1);
    // no email on the identity → 400; a stranger → 404
    expect((await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity() })).status).toBe(400);
    expect((await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity(stranger.address, "x@y.test") })).status).toBe(404);
  });

  it("FR_CHK_029_a_failed_send_releases_the_slot_and_answers_502_so_the_next_tap_can_try_again", async () => {
    const { subId, stream } = await liveSession(m);
    const cancelTx = "0x" + "c".repeat(64);
    await api("POST", "/internal/ingest", { headers: INGEST, body: { ...settled(220, "880000", "8800", T0 + 220, cancelTx), address: stream } });
    await api("POST", "/internal/ingest", { headers: INGEST, body: { ...streamCanceled(T0 + 220, 220, "880000", "13520000", cancelTx), address: stream } });
    setMailer(async () => {
      throw new Error("Resend responded 403: domain not verified");
    });
    const failed = await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity(subscriber.address, "sub@example.com") });
    expect(failed.status).toBe(502);
    expect(failed.body.error.message).toBe("We couldn't send the receipt right now. Try again in a moment.");
    setMailer(async (mail) => {
      mails.push(mail);
    });
    const ok = await api("POST", `/v1/account/subscriptions/${subId}/receipt/email`, { body: {}, headers: await identity(subscriber.address, "sub@example.com") });
    expect(ok.status).toBe(200);
    expect(mails).toHaveLength(1);
  });
});
