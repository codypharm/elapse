import { sign } from "hono/jwt";
import { setPrivySettings } from "../src/lib/privy";

/**
 * A local Privy app for route tests (FR-API-120): one P-256 key pair, tokens minted on demand.
 * `use()` points the verifier at it; `off()` makes the API unconfigured (FR-API-125).
 */
export const PRIVY_TEST_APP_ID = "cmapp_test_123";

export async function privyFixture() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = Buffer.from(await crypto.subtle.exportKey("spki", kp.publicKey)).toString("base64");
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
  const now = () => Math.floor(Date.now() / 1000);
  return {
    pem,
    use: () => setPrivySettings({ appId: PRIVY_TEST_APP_ID, verificationKey: pem }),
    off: () => setPrivySettings(null),
    /** An identity token for `wallet` (the embedded wallet), optionally with a verified email. */
    token: (wallet: string, o: { email?: string; sub?: string; exp?: number } = {}) => {
      const accounts: Record<string, unknown>[] = [{ type: "wallet", address: wallet, chain_type: "ethereum", wallet_client_type: "privy" }];
      if (o.email) accounts.push({ type: "email", address: o.email });
      return sign({ sub: o.sub ?? `did:privy:${wallet.slice(2, 10)}`, iss: "privy.io", aud: PRIVY_TEST_APP_ID, iat: now() - 5, exp: o.exp ?? now() + 3600, linked_accounts: JSON.stringify(accounts) }, kp.privateKey, "ES256");
    },
  };
}
