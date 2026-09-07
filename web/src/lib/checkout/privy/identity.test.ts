/**
 * FR-CHK-027: the identity token comes from what the Privy SDK already holds; Privy is asked
 * only when that token is missing or about to expire. Two calls per cap click hit Privy's rate
 * limit on the first real run (2026-09-07), so the normal path must make no request at all.
 */
import { describe, expect, it, vi } from "vitest";
import { freshIdentityToken, tokenExpiry } from "./identity";

const jwt = (exp: number) => `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;
const NOW = 1_757_200_000_000;

describe("freshIdentityToken", () => {
  it("returns the held token without asking Privy when it has more than a minute left", async () => {
    const refresh = vi.fn(async () => jwt(NOW / 1000 + 3600));
    const held = jwt(NOW / 1000 + 600);
    expect(await freshIdentityToken({ held, refresh, now: NOW })).toBe(held);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("asks Privy once when the held token is missing, malformed, or within a minute of expiry", async () => {
    const fresh = jwt(NOW / 1000 + 3600);
    for (const held of [null, "garbage", jwt(NOW / 1000 + 30), jwt(NOW / 1000 - 5)]) {
      const refresh = vi.fn(async () => fresh);
      expect(await freshIdentityToken({ held, refresh, now: NOW })).toBe(fresh);
      expect(refresh).toHaveBeenCalledTimes(1);
    }
  });

  it("a refresh that fails or returns nothing yields null, never a throw", async () => {
    expect(await freshIdentityToken({ held: null, refresh: async () => { throw new Error("Too many requests"); }, now: NOW })).toBeNull();
    expect(await freshIdentityToken({ held: null, refresh: async () => null, now: NOW })).toBeNull();
  });

  it("tokenExpiry reads exp in milliseconds and is null for anything else", () => {
    expect(tokenExpiry(jwt(1_757_203_600))).toBe(1_757_203_600_000);
    expect(tokenExpiry("nope")).toBeNull();
    expect(tokenExpiry(null)).toBeNull();
  });
});
