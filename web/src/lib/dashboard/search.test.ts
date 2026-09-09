/** Top-bar search resolves ids and emails to a page (FR-DSH-005). */
import { beforeEach, describe, expect, it } from "vitest";
import { createMockDashboardApi, resetMockDashboardApi, type MockDashboardApi } from "./mock-api";

describe("resolveSearch (FR-DSH-005)", () => {
  let api: MockDashboardApi;
  beforeEach(async () => {
    localStorage.clear();
    resetMockDashboardApi();
    api = createMockDashboardApi({ latencyMs: 0 });
    const { devToken } = await api.requestMagicLink("demo@elapse.finance");
    await api.verifyMagicLink(devToken);
  });

  it("resolves each id prefix to its detail route", async () => {
    const sub = (await api.listSubscriptions("test", {})).data[0]!;
    expect(await api.resolveSearch("test", sub.id)).toBe(`/dashboard/subscriptions/${sub.id}`);
    expect(await api.resolveSearch("test", sub.checkoutSession)).toBe(`/dashboard/subscriptions/${sub.id}`);
    expect(await api.resolveSearch("test", sub.customer.id)).toBe(`/dashboard/customers/${sub.customer.id}`);
    const ev = (await api.listEvents("test", {})).data[0]!;
    expect(await api.resolveSearch("test", ev.id)).toBe(`/dashboard/developers/events/${ev.id}`);
    const ep = (await api.listEndpoints("test"))[0]!;
    expect(await api.resolveSearch("test", ep.id)).toBe(`/dashboard/developers/webhooks/${ep.id}`);
    const prod = (await api.listProducts("test", {})).data[0]!;
    expect(await api.resolveSearch("test", prod.id)).toBe(`/dashboard/products?highlight=${prod.id}`);
  });

  it("resolves an email to the customer and unknowns to null", async () => {
    const c = (await api.listCustomers("test", {})).data.find((x) => x.email)!;
    expect(await api.resolveSearch("test", c.email!)).toBe(`/dashboard/customers/${c.id}`);
    expect(await api.resolveSearch("test", "sub_nope")).toBeNull();
    expect(await api.resolveSearch("test", "nobody@example.com")).toBeNull();
  });

  it("does not cross modes", async () => {
    const sub = (await api.listSubscriptions("live", {})).data[0]!;
    expect(await api.resolveSearch("test", sub.id)).toBeNull();
  });
});

describe("search as you type (FR-DSH-005, mock of FR-API-135)", () => {
  let api: MockDashboardApi;
  beforeEach(async () => {
    localStorage.clear();
    resetMockDashboardApi();
    api = createMockDashboardApi({ latencyMs: 0 });
    const { devToken } = await api.requestMagicLink("demo@elapse.finance");
    await api.verifyMagicLink(devToken);
  });

  it("matches a partial id by prefix and a partial email or product name anywhere, case-insensitively, capped at five", async () => {
    const sub = (await api.listSubscriptions("test", {})).data[0]!;
    const byPrefix = await api.search("test", sub.id.slice(0, 8));
    expect(byPrefix.some((h) => h.type === "subscription" && h.id === sub.id)).toBe(true);
    expect(byPrefix.length).toBeLessThanOrEqual(5);
    const c = (await api.listCustomers("test", {})).data.find((x) => x.email)!;
    const byEmail = await api.search("test", c.email!.slice(1, 5).toUpperCase());
    expect(byEmail.some((h) => h.type === "customer" && h.id === c.id && h.label === c.email)).toBe(true);
    const p = (await api.listProducts("test", {})).data[0]!;
    const byName = await api.search("test", p.name.slice(0, 3).toLowerCase());
    expect(byName[0]).toMatchObject({ type: "product", id: p.id, label: p.name });
    expect(byName[0]!.detail).toContain(p.rateUsdPerSecond);
    expect(await api.search("test", "z")).toEqual([]);
    expect(await api.search("test", "zzzz")).toEqual([]);
  });

  it("is scoped to the mode", async () => {
    const sub = (await api.listSubscriptions("test", {})).data[0]!;
    expect((await api.search("live", sub.id)).some((h) => h.id === sub.id)).toBe(false);
  });
});
