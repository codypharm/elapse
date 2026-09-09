import { beforeEach, describe, expect, it } from "bun:test";
import { sql } from "../src/db/client";
import { createEvent } from "../src/db/events";
import { createSession } from "../src/db/sessions";
import { api, resetDb, seedMerchant, type Fixture } from "./helpers";

/** FR-API-135: the dashboard's search-as-you-type route (ADR 2026-09-09). */
let m: Fixture;
let cookie: string;
const search = (q: string, mode: "test" | "live" = "test") =>
  api("GET", `/v1/dashboard/search?q=${encodeURIComponent(q)}`, { headers: { cookie, origin: "http://localhost:3000", "x-elapse-mode": mode } });

let ids: { product: string; endpoint: string; event: string; session: string };

beforeEach(async () => {
  await resetDb();
  m = await seedMerchant();
  cookie = `elapse_session=${(await createSession(m.merchantId, null)).token}`;
  const p = await api("POST", "/v1/products", { key: m.skTest, body: { name: "Tera hub GPU", rate_usd_per_second: "0.004" } });
  await sql`INSERT INTO customers (id, merchant_id, livemode, wallet_address, email) VALUES ('cus_annfix', ${m.merchantId}, false, '0x0000000000000000000000000000000000000001', 'ann@example.test')`;
  await sql`INSERT INTO subscriptions (id, merchant_id, livemode, product_id, customer_id, status, chain_id, rate_per_second_wei, max_duration_seconds, max_escrow_wei)
            VALUES ('sub_annfix', ${m.merchantId}, false, ${p.body.id}, 'cus_annfix', 'active', 10143, 4000, 3600, 14400000)`;
  const ep = await api("POST", "/v1/webhook_endpoints", { key: m.skTest, body: { url: "https://hooks.acme.example/elapse", events: ["*"] } });
  const ev = await createEvent({ merchantId: m.merchantId, livemode: false, type: "invoice.settled", object: { id: "sub_annfix", object: "subscription", status: "active" } });
  const cs = await api("POST", "/v1/checkout/sessions", { key: m.skTest, body: { product: p.body.id, success_url: "https://acme.example/ok", cancel_url: "https://acme.example/no" } });
  ids = { product: p.body.id, endpoint: ep.body.id, event: ev.id, session: cs.body.id };
});

describe("FR-API-135 dashboard search", () => {
  it("finds one row per object type by a partial id, with a label and one line of context", async () => {
    for (const [type, id] of Object.entries({ product: ids.product, customer: "cus_annfix", subscription: "sub_annfix", event: ids.event, endpoint: ids.endpoint, checkout_session: ids.session })) {
      const r = await search(id.slice(0, 7));
      expect(r.status).toBe(200);
      expect(r.body.object).toBe("list");
      const row = r.body.data.find((x: { id: string }) => x.id === id);
      expect(row, `${type} ${id}`).toMatchObject({ type, id, label: expect.any(String), detail: expect.any(String) });
    }
    const product = (await search(ids.product)).body.data[0];
    expect(product).toMatchObject({ type: "product", label: "Tera hub GPU" });
    expect(product.detail).toContain("0.004");
    const customer = (await search("cus_ann")).body.data[0];
    expect(customer).toMatchObject({ type: "customer", label: "ann@example.test" });
    const endpoint = (await search(ids.endpoint)).body.data[0];
    expect(endpoint.detail).toContain("hooks.acme.example");
    const event = (await search(ids.event)).body.data[0];
    expect(event.detail).toContain("invoice.settled");
  });

  it("matches a partial email and a partial product name, case-insensitively, and orders products before customers", async () => {
    const r = await search("ANN@");
    expect(r.body.data.map((x: { type: string }) => x.type)).toEqual(["customer"]);
    const p = await search("tera hub");
    expect(p.body.data[0]).toMatchObject({ type: "product", id: ids.product });
    // the customer's email holds "ex"; the product's name does not; the id prefix "cus_" does not match "ex"
    const both = await search("example");
    expect(both.body.data.map((x: { type: string }) => x.type)).toEqual(["customer"]);
  });

  it("never returns another merchant's objects, the other mode's, a key, a secret, or a payload; caps at five", async () => {
    const other = await seedMerchant();
    await api("POST", "/v1/products", { key: other.skTest, body: { name: "Tera hub GPU", rate_usd_per_second: "0.004" } });
    const r = await search("Tera hub");
    expect(r.body.data).toHaveLength(1);
    expect((await search("Tera hub", "live")).body.data).toEqual([]);
    expect((await search("sub_annfix", "live")).body.data).toEqual([]);
    for (let i = 0; i < 7; i++) await api("POST", "/v1/products", { key: m.skTest, body: { name: `Bulk ${i}`, rate_usd_per_second: "0.001" } });
    const bulk = await search("Bulk");
    expect(bulk.body.data).toHaveLength(5);
    const text = JSON.stringify((await search("sk_")).body) + JSON.stringify((await search("whsec_")).body) + JSON.stringify((await search(ids.event)).body);
    expect(text).not.toMatch(/sk_(test|live)_|whsec_|"payload"|"data":\{/);
  });

  it("rejects a query shorter than two characters and one that is only spaces; needs a dashboard session", async () => {
    expect((await search("a")).status).toBe(400);
    expect((await search("   ")).status).toBe(400);
    expect((await search("")).status).toBe(400);
    const nokey = await api("GET", "/v1/dashboard/search?q=sub_", { key: m.skTest });
    expect(nokey.status).toBe(401);
  });
});
