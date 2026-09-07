/**
 * FR-API-120 / FR-API-125: the Privy identity token verifier. Offline ES256 with a locally
 * generated P-256 key pair; no network. Every failure is one error class; the token never
 * appears in a message.
 */
import { describe, expect, it } from "bun:test";
import { sign } from "hono/jwt";
import { verifyIdentityToken, SubscriberAuthError, SubscriberAuthUnconfigured } from "../src/lib/privy";

const APP_ID = "cmapp_test_123";
const NOW = 1_757_200_000;
const WALLET = "0x1111111111111111111111111111111111111111";

async function keyPair() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = Buffer.from(await crypto.subtle.exportKey("spki", kp.publicKey)).toString("base64");
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
  return { privateKey: kp.privateKey, pem };
}

type Account = Record<string, unknown>;
const embedded = (address = WALLET): Account => ({ type: "wallet", address, chain_type: "ethereum", wallet_client_type: "privy" });

async function token(privateKey: CryptoKey, over: Record<string, unknown> = {}, accounts: Account[] = [embedded()]) {
  return sign({ sub: "did:privy:user1", iss: "privy.io", aud: APP_ID, iat: NOW - 10, exp: NOW + 3600, linked_accounts: JSON.stringify(accounts), ...over }, privateKey, "ES256");
}

describe("FR-API-120 verifyIdentityToken", () => {
  it("FR_API_120_valid_token_yields_the_embedded_wallet_and_no_email", async () => {
    const { privateKey, pem } = await keyPair();
    const id = await verifyIdentityToken(await token(privateKey), { appId: APP_ID, verificationKey: pem, now: NOW });
    expect(id).toEqual({ userId: "did:privy:user1", walletAddress: WALLET, email: null });
  });

  it("FR_API_120_email_comes_from_the_email_account_else_google_never_from_a_wallet", async () => {
    const { privateKey, pem } = await keyPair();
    const o = { appId: APP_ID, verificationKey: pem, now: NOW };
    const both = await verifyIdentityToken(await token(privateKey, {}, [{ type: "google_oauth", email: "g@example.com" }, embedded(), { type: "email", address: "e@example.com" }]), o);
    expect(both.email).toBe("e@example.com");
    const google = await verifyIdentityToken(await token(privateKey, {}, [embedded(), { type: "google_oauth", email: "g@example.com" }]), o);
    expect(google.email).toBe("g@example.com");
  });

  it("FR_API_120_every_token_problem_is_one_error_that_never_carries_the_token", async () => {
    const { privateKey, pem } = await keyPair();
    const other = await keyPair();
    const o = { appId: APP_ID, verificationKey: pem, now: NOW };
    const bad: [string, () => Promise<string | undefined>][] = [
      ["missing", async () => undefined],
      ["malformed", async () => "not.a.jwt.at.all"],
      ["signed by another key", () => token(other.privateKey)],
      ["wrong audience", () => token(privateKey, { aud: "cmapp_other" })],
      ["wrong issuer", () => token(privateKey, { iss: "example.com" })],
      ["expired beyond skew", () => token(privateKey, { exp: NOW - 61 })],
      ["no exp", () => token(privateKey, { exp: undefined })],
      ["no subject", () => token(privateKey, { sub: undefined })],
      ["external wallet only", () => token(privateKey, {}, [{ type: "wallet", address: WALLET, chain_type: "ethereum", wallet_client_type: "metamask" }])],
      ["no wallet", () => token(privateKey, {}, [{ type: "email", address: "e@example.com" }])],
      ["solana embedded only", () => token(privateKey, {}, [{ type: "wallet", address: "7xKX", chain_type: "solana", wallet_client_type: "privy" }])],
    ];
    for (const [name, make] of bad) {
      const t = await make();
      const err = await verifyIdentityToken(t, o).catch((e: unknown) => e);
      expect(err, name).toBeInstanceOf(SubscriberAuthError);
      expect((err as Error).message, name).toBe("Sign in again to continue.");
      if (t) expect((err as Error).message, name).not.toContain(t.slice(0, 20));
    }
    // inside the 60 s skew still passes
    expect((await verifyIdentityToken(await token(privateKey, { exp: NOW - 30 }), o)).walletAddress).toBe(WALLET);
  });

  it("FR_API_120_the_failure_class_is_reported_for_the_log_without_the_token", async () => {
    const { privateKey, pem } = await keyPair();
    const other = await keyPair();
    const cases: [string, string | undefined][] = [
      ["missing", undefined],
      ["malformed", "not.a.jwt.at.all"],
      ["signature", await token(other.privateKey)],
      ["audience", await token(privateKey, { aud: "cmapp_other" })],
      ["issuer", await token(privateKey, { iss: "example.com" })],
      ["expired", await token(privateKey, { exp: NOW - 61 })],
      ["no_embedded_wallet", await token(privateKey, {}, [{ type: "email", address: "e@example.com" }])],
    ];
    for (const [expected, t] of cases) {
      const seen: string[] = [];
      await verifyIdentityToken(t, { appId: APP_ID, verificationKey: pem, now: NOW, onReject: (r) => seen.push(r) }).catch(() => {});
      expect(seen, expected).toEqual([expected]);
    }
  });

  it("FR_API_120_the_verification_key_may_be_pasted_bare_one_line_or_with_literal_newlines", async () => {
    const { privateKey, pem } = await keyPair();
    const body = pem.replace(/-+(BEGIN|END).*?-+/g, "").replace(/\s/g, "");
    const shapes = [pem, body, `-----BEGIN PUBLIC KEY-----${body}-----END PUBLIC KEY-----`, pem.replace(/\n/g, "\\n"), `  ${body}\n`];
    for (const key of shapes) {
      const id = await verifyIdentityToken(await token(privateKey), { appId: APP_ID, verificationKey: key, now: NOW });
      expect(id.walletAddress, key.slice(0, 12)).toBe(WALLET);
    }
  });

  it("FR_API_125_unconfigured_is_its_own_error_before_any_token_is_read", async () => {
    const { privateKey } = await keyPair();
    await expect(verifyIdentityToken(await token(privateKey), { now: NOW })).rejects.toBeInstanceOf(SubscriberAuthUnconfigured);
    await expect(verifyIdentityToken(undefined, { now: NOW })).rejects.toBeInstanceOf(SubscriberAuthUnconfigured);
  });
});
