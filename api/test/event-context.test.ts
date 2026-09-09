import { beforeEach, describe, expect, it } from "bun:test";
import { sql } from "../src/db/client";
import { createEvent } from "../src/db/events";
import { createSession } from "../src/db/sessions";
import { api, resetDb, seedMerchant, type Fixture } from "./helpers";

/** FR-API-136: the dashboard-only `context` line on events (dashboard FR-DSH-093). */
let m: Fixture;
let cookie: string;
let productId: string;
const session = (path: string) => api("GET", path, { headers: { cookie, origin: "http://localhost:3000", "x-elapse-mode": "test" } });

beforeEach(async () => {
  await resetDb();
  m = await seedMerchant();
  cookie = `elapse_session=${(await createSession(m.merchantId, null)).token}`;
  const p = await api("POST", "/v1/products", { key: m.skTest, body: { name: "Tera hub GPU", rate_usd_per_second: "0.004" } });
  productId = p.body.id;
  await sql`INSERT INTO customers (id, merchant_id, livemode, wallet_address, email) VALUES ('cus_ann', ${m.merchantId}, false, '0x0000000000000000000000000000000000000001', 'ann@example.test')`;
  await sql`INSERT INTO subscriptions (id, merchant_id, livemode, product_id, customer_id, status, chain_id, rate_per_second_wei, max_duration_seconds, max_escrow_wei)
            VALUES ('sub_ann', ${m.merchantId}, false, ${productId}, 'cus_ann', 'active', 10143, 4000, 3600, 14400000)`;
});

describe("FR-API-136 event context", () => {
  it("a dashboard session sees product name and customer email on a subscription event", async () => {
    await createEvent({ merchantId: m.merchantId, livemode: false, type: "subscription.created", object: { id: "sub_ann", object: "subscription", status: "active", product: productId, customer: "cus_ann" } });
    const r = await session("/v1/events");
    expect(r.status).toBe(200);
    expect(r.body.data[0].context).toEqual({ product_name: "Tera hub GPU", customer: "cus_ann", customer_email: "ann@example.test" });
  });

  it("the home overview's recent events carry context too (FR-DSH-023)", async () => {
    await createEvent({ merchantId: m.merchantId, livemode: false, type: "subscription.created", object: { id: "sub_ann", object: "subscription", status: "active", product: productId, customer: "cus_ann" } });
    const r = await session("/v1/dashboard/overview");
    expect(r.status).toBe(200);
    expect(r.body.recent_events[0].context).toEqual({ product_name: "Tera hub GPU", customer: "cus_ann", customer_email: "ann@example.test" });
  });

  it("an API key request keeps the FR-API-063 shape: no context on the list or the detail", async () => {
    const ev = await createEvent({ merchantId: m.merchantId, livemode: false, type: "subscription.created", object: { id: "sub_ann", object: "subscription", status: "active", product: productId, customer: "cus_ann" } });
    const list = await api("GET", "/v1/events", { key: m.skTest });
    expect(list.body.data[0]).not.toHaveProperty("context");
    const one = await api("GET", `/v1/events/${ev.id}`, { key: m.skTest });
    expect(one.body).not.toHaveProperty("context");
    expect((await session(`/v1/events/${ev.id}`)).body.context).toEqual({ product_name: "Tera hub GPU", customer: "cus_ann", customer_email: "ann@example.test" });
  });

  it("an invoice event resolves product and email through its subscription and carries amount_settled", async () => {
    await createEvent({ merchantId: m.merchantId, livemode: false, type: "invoice.settled", object: { id: "in_1", object: "invoice", subscription: "sub_ann", seconds: 83, amount_settled: "0.332" } });
    const r = await session("/v1/events");
    expect(r.body.data[0].context).toEqual({ product_name: "Tera hub GPU", customer: "cus_ann", customer_email: "ann@example.test", amount_settled: "0.332" });
  });

  it("no email → customer_email null; an unresolvable or another merchant's subscription → context null", async () => {
    await sql`INSERT INTO customers (id, merchant_id, livemode, wallet_address, email) VALUES ('cus_pk', ${m.merchantId}, false, '0x0000000000000000000000000000000000000002', NULL)`;
    await sql`INSERT INTO subscriptions (id, merchant_id, livemode, product_id, customer_id, status, chain_id, rate_per_second_wei, max_duration_seconds, max_escrow_wei)
              VALUES ('sub_pk', ${m.merchantId}, false, ${productId}, 'cus_pk', 'active', 10143, 4000, 3600, 14400000)`;
    const other = await seedMerchant();
    const op = await api("POST", "/v1/products", { key: other.skTest, body: { name: "Other GPU", rate_usd_per_second: "0.004" } });
    await sql`INSERT INTO customers (id, merchant_id, livemode, wallet_address, email) VALUES ('cus_oth', ${other.merchantId}, false, '0x0000000000000000000000000000000000000003', 'bob@other.test')`;
    await sql`INSERT INTO subscriptions (id, merchant_id, livemode, product_id, customer_id, status, chain_id, rate_per_second_wei, max_duration_seconds, max_escrow_wei)
              VALUES ('sub_oth', ${other.merchantId}, false, ${op.body.id}, 'cus_oth', 'active', 10143, 4000, 3600, 14400000)`;

    const noEmail = await createEvent({ merchantId: m.merchantId, livemode: false, type: "subscription.created", object: { id: "sub_pk", object: "subscription", product: productId, customer: "cus_pk" } });
    const gone = await createEvent({ merchantId: m.merchantId, livemode: false, type: "subscription.canceled", object: { id: "sub_gone", object: "subscription" } });
    const foreign = await createEvent({ merchantId: m.merchantId, livemode: false, type: "invoice.settled", object: { id: "in_x", object: "invoice", subscription: "sub_oth", amount_settled: "1" } });
    const byId = Object.fromEntries((await session("/v1/events")).body.data.map((e: any) => [e.id, e.context]));
    expect(byId[noEmail.id]).toEqual({ product_name: "Tera hub GPU", customer: "cus_pk", customer_email: null });
    expect(byId[gone.id]).toBeNull();
    expect(byId[foreign.id]).toBeNull();
    expect(JSON.stringify(byId)).not.toContain("Other GPU");
  });
});
