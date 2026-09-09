import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "../src/db/client";
import { createEvent } from "../src/db/events";
import { setMailer, type Mail } from "../src/lib/email";
import { claimDue } from "../src/worker/queue";
import { attemptDelivery, type DeliveryLogger } from "../src/worker/deliver";
import { expirySweep, writeNotice } from "../src/worker/notify";
import { api, resetDb, seedMerchant, type Fixture } from "./helpers";
import { startReceiver } from "./mock-receiver";

/**
 * FR-API-109 / FR-WRK-042: the notification kinds the bell shows that are not
 * failure streaks: first delivery succeeded, key expiring, secret expiring; and
 * the emails behind the merchant's two switches (FR-DSH-105/132).
 */
const receiver = startReceiver();
afterAll(() => receiver.stop());

let f: Fixture;
const sent: Mail[] = [];
const logger: DeliveryLogger = () => {};
const opts = { timeoutMs: 10_000, now: () => new Date(), log: logger };

beforeEach(async () => {
  await resetDb();
  await sql`DELETE FROM notifications`;
  f = await seedMerchant();
  receiver.received.length = 0;
  receiver.respond(200, "ok");
  sent.length = 0;
  setMailer(async (m) => { sent.push(m); });
});
afterEach(() => setMailer(null));

async function endpoint(key = f.skTest) {
  const r = await api("POST", "/v1/webhook_endpoints", { key, body: { url: receiver.url, events: ["*"] } });
  expect(r.status).toBe(200);
  return r.body as { id: string; secret: string };
}

async function deliverOne(livemode = false) {
  await createEvent({ merchantId: f.merchantId, livemode, type: "subscription.created", object: { id: "sub_1", object: "subscription", status: "active" } });
  await sql`UPDATE deliveries SET next_attempt_at = now(), locked_until = NULL WHERE status IN ('queued','retrying')`;
  for (const j of await claimDue(10)) await attemptDelivery(j, opts);
}

const notifications = (kind: string): Promise<{ kind: string; summary: string; target_id: string; livemode: boolean; emailed_at: Date | null }[]> => sql`SELECT kind, summary, target_id, livemode, emailed_at FROM notifications WHERE merchant_id = ${f.merchantId} AND kind = ${kind} ORDER BY created_at`;

describe("FR-API-109 first delivery succeeded", () => {
  test("the first 2xx delivery in a mode writes one notification naming the endpoint; later ones do not", async () => {
    const ep = await endpoint();
    await deliverOne();
    await deliverOne();
    const rows = await notifications("first_delivery_succeeded");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ target_id: ep.id, livemode: false, emailed_at: null });
    expect(rows[0]!.summary).toContain(new URL(receiver.url).host);
    expect(sent).toHaveLength(0);
  });

  test("a failed delivery is not a first delivery; each mode gets its own", async () => {
    const ep = await endpoint();
    receiver.respond(500);
    await deliverOne();
    expect(await notifications("first_delivery_succeeded")).toHaveLength(0);
    receiver.respond(200);
    await deliverOne();
    // A live endpoint cannot point at the local receiver (FR-WRK-016), so the live notice is written the way the worker writes it.
    const live = { merchantId: f.merchantId, livemode: true, kind: "first_delivery_succeeded" as const, targetId: ep.id, summary: "live", dedupeKey: "first_delivery_succeeded:live" };
    expect(await writeNotice(sql, live)).not.toBeNull();
    expect(await writeNotice(sql, live)).toBeNull();
    const rows = await notifications("first_delivery_succeeded");
    expect(rows.map((r) => r.livemode)).toEqual([false, true]);
  });
});

describe("FR-WRK-042 expiry notices", () => {
  const T0 = new Date("2026-09-09T12:00:00Z");
  const at = (h: number) => new Date(T0.getTime() + h * 3_600_000);

  test("a key rolled with a 24 h grace: one notice inside 24 h, one more inside 1 h, never a third", async () => {
    const [key] = await sql`SELECT id FROM api_keys WHERE merchant_id = ${f.merchantId} AND kind = 'sk' AND livemode = false`;
    await sql`UPDATE api_keys SET expires_at = ${at(24)} WHERE id = ${key!.id}`;
    expect(await expirySweep(at(-1))).toBe(0);
    expect(await expirySweep(at(0.5))).toBe(1);
    expect(await expirySweep(at(1))).toBe(0);
    expect(await expirySweep(at(23.5))).toBe(1);
    expect(await expirySweep(at(23.7))).toBe(0);
    const rows = await notifications("key_expiring");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ target_id: key!.id, livemode: false });
    expect(rows[0]!.summary).toMatch(/24 hours/);
    expect(rows[1]!.summary).toMatch(/1 hour/);
  });

  test("a key rolled with a 1 h grace gets the 1 h notice only; a revoked or expired key gets none", async () => {
    const [key] = await sql`SELECT id FROM api_keys WHERE merchant_id = ${f.merchantId} AND kind = 'sk' AND livemode = true`;
    await sql`UPDATE api_keys SET expires_at = ${at(1)} WHERE id = ${key!.id}`;
    expect(await expirySweep(at(0))).toBe(1);
    expect((await notifications("key_expiring")).map((r) => r.livemode)).toEqual([true]);
    await sql`UPDATE api_keys SET revoked_at = now() WHERE id = ${key!.id}`;
    await sql`DELETE FROM notifications`;
    expect(await expirySweep(at(0))).toBe(0);
    await sql`UPDATE api_keys SET revoked_at = NULL, expires_at = ${at(-1)} WHERE id = ${key!.id}`;
    expect(await expirySweep(at(0))).toBe(0);
  });

  test("an endpoint secret rolled with grace gets the same two notices, naming the endpoint", async () => {
    const ep = await endpoint();
    const r = await api("POST", `/v1/webhook_endpoints/${ep.id}/roll_secret`, { key: f.skTest, body: { grace: 86400 } });
    expect(r.status).toBe(200);
    const [row] = await sql`SELECT previous_secret_expires_at AS exp FROM webhook_endpoints WHERE id = ${ep.id}`;
    const exp = new Date(row!.exp);
    expect(await expirySweep(new Date(exp.getTime() - 20 * 3_600_000))).toBe(1);
    expect(await expirySweep(new Date(exp.getTime() - 30 * 60_000))).toBe(1);
    expect(await expirySweep(new Date(exp.getTime() - 10 * 60_000))).toBe(0);
    const rows = await notifications("secret_expiring");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ target_id: ep.id });
    expect(rows[0]!.summary).toContain(new URL(receiver.url).host);
  });
});

describe("FR-API-109 / FR-DSH-132 emails behind the switches", () => {
  test("an expiry notice is emailed to the merchant and stamped, once per notice, when the switch is on", async () => {
    const [key] = await sql`SELECT id FROM api_keys WHERE merchant_id = ${f.merchantId} AND kind = 'sk' AND livemode = false`;
    await sql`UPDATE api_keys SET expires_at = now() + interval '30 minutes' WHERE id = ${key!.id}`;
    await expirySweep(new Date());
    await expirySweep(new Date());
    const [m] = await sql`SELECT email FROM merchants WHERE id = ${f.merchantId}`;
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(m!.email);
    expect(sent[0]!.subject).toMatch(/key/i);
    expect(sent[0]!.text).toContain("/dashboard/developers/keys");
    expect(sent[0]!.html).toContain("/dashboard/developers/keys");
    expect(sent[0]!.text).not.toMatch(/sk_(test|live)_[A-Za-z0-9]{8}/);
    const rows = await notifications("key_expiring");
    expect(rows[0]!.emailed_at).not.toBeNull();
  });

  test("no email when the switch is off; the notification is still written", async () => {
    await sql`UPDATE merchants SET notify_key_expiry = false WHERE id = ${f.merchantId}`;
    const [key] = await sql`SELECT id FROM api_keys WHERE merchant_id = ${f.merchantId} AND kind = 'sk' AND livemode = false`;
    await sql`UPDATE api_keys SET expires_at = now() + interval '30 minutes' WHERE id = ${key!.id}`;
    expect(await expirySweep(new Date())).toBe(1);
    expect(sent).toHaveLength(0);
    expect((await notifications("key_expiring"))[0]!.emailed_at).toBeNull();
  });

  test("a mail failure keeps the notification and leaves emailed_at empty", async () => {
    setMailer(async () => { throw new Error("Resend responded 500"); });
    const [key] = await sql`SELECT id FROM api_keys WHERE merchant_id = ${f.merchantId} AND kind = 'sk' AND livemode = false`;
    await sql`UPDATE api_keys SET expires_at = now() + interval '30 minutes' WHERE id = ${key!.id}`;
    expect(await expirySweep(new Date())).toBe(1);
    expect((await notifications("key_expiring"))[0]!.emailed_at).toBeNull();
  });

  test("auto-disable after 3 days of failures emails the merchant when that switch is on, not when off", async () => {
    const T0 = new Date("2026-09-05T00:00:00Z");
    const ep = await endpoint();
    receiver.respond(500);
    for (const h of [0, 30, 73]) {
      await createEvent({ merchantId: f.merchantId, livemode: false, type: "subscription.created", object: { id: "sub_1", object: "subscription", status: "active" } });
      await sql`UPDATE deliveries SET next_attempt_at = now(), locked_until = NULL WHERE status IN ('queued','retrying')`;
      for (const j of await claimDue(10)) await attemptDelivery(j, { ...opts, now: () => new Date(T0.getTime() + h * 3_600_000) });
    }
    const [n] = await notifications("endpoint_exhausted");
    expect(n).toMatchObject({ target_id: ep.id });
    expect(n!.emailed_at).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toMatch(/webhook/i);
    expect(sent[0]!.text).toContain(`/dashboard/developers/webhooks/${ep.id}`);
    expect(sent[0]!.text).not.toMatch(/whsec_[A-Za-z0-9]{8}/);
  });
});
