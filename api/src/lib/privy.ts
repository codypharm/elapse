import { verify } from "hono/jwt";
import { config } from "../config";

/**
 * FR-API-120 / FR-API-125: who the subscriber is, from a Privy identity token
 * ([ADR 2026-09-07](../../../docs/decisions/2026-09-07-privy-identity-token-on-prepare.md)).
 *
 * The page sends the token in `X-Privy-Token`. It is an ES256 JWT signed by the app's
 * verification key, so it is checked offline: signature, `iss = privy.io`, `aud = app id`,
 * `exp` with 60 s of skew. The subscriber's wallet is the token's Privy embedded wallet;
 * the email is the verified email account, else the Google account. Every failure is one
 * `SubscriberAuthError` whose message never contains the token.
 */

export interface SubscriberIdentity {
  /** Privy user id (`did:privy:…`). */
  userId: string;
  /** The embedded wallet address, as Privy reports it. */
  walletAddress: string;
  email: string | null;
}

export interface PrivySettings {
  appId: string;
  /** PEM public key from the Privy dashboard (App settings → Basics → Verification key). */
  verificationKey: string;
}

/** 401 `subscriber_auth_invalid`: one message for every token problem. */
export class SubscriberAuthError extends Error {
  constructor() {
    super("Sign in again to continue.");
  }
}

/** 503 `subscriber_auth_unconfigured`: the API has no Privy app to verify against. */
export class SubscriberAuthUnconfigured extends Error {
  constructor() {
    super("Subscriber sign-in is not configured: set PRIVY_APP_ID and PRIVY_VERIFICATION_KEY.");
  }
}

const ISSUER = "privy.io";
const SKEW_SECONDS = 60;

let override: PrivySettings | null | undefined;

/** Test seam, like `setChainClient`: `null` makes the API unconfigured, `undefined` restores the env. */
export function setPrivySettings(settings: PrivySettings | null | undefined): void {
  override = settings;
}

export function privySettings(): PrivySettings | null {
  if (override !== undefined) return override;
  const { privyAppId, privyVerificationKey } = config;
  return privyAppId && privyVerificationKey ? { appId: privyAppId, verificationKey: privyVerificationKey } : null;
}

interface LinkedAccount {
  type?: unknown;
  address?: unknown;
  email?: unknown;
  chain_type?: unknown;
  wallet_client_type?: unknown;
}

export async function verifyIdentityToken(
  token: string | undefined,
  o: Partial<PrivySettings> & { now?: number } = {},
): Promise<SubscriberIdentity> {
  const settings = o.appId && o.verificationKey ? { appId: o.appId, verificationKey: o.verificationKey } : privySettings();
  if (!settings) throw new SubscriberAuthUnconfigured();
  if (!token || token.split(".").length !== 3) throw new SubscriberAuthError();

  let payload: Record<string, unknown>;
  try {
    // Hono checks the signature, issuer and audience; time is checked below with our clock and skew.
    payload = (await verify(token, settings.verificationKey, { alg: "ES256", iss: ISSUER, aud: settings.appId, exp: false, iat: false, nbf: false })) as Record<string, unknown>;
  } catch {
    throw new SubscriberAuthError();
  }

  const now = o.now ?? Math.floor(Date.now() / 1000);
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp + SKEW_SECONDS <= now) throw new SubscriberAuthError();
  if (typeof payload.sub !== "string" || !payload.sub) throw new SubscriberAuthError();

  const accounts = linkedAccounts(payload.linked_accounts);
  const wallet = accounts.find((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.wallet_client_type === "privy" && typeof a.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.address));
  if (!wallet) throw new SubscriberAuthError();

  const emailAccount = accounts.find((a) => a.type === "email" && typeof a.address === "string") ?? accounts.find((a) => a.type === "google_oauth" && typeof a.email === "string");
  const email = emailAccount ? String(emailAccount.type === "email" ? emailAccount.address : emailAccount.email) : null;

  return { userId: payload.sub, walletAddress: wallet.address as string, email };
}

/** Privy serialises `linked_accounts` as a JSON string; accept an array too. */
function linkedAccounts(raw: unknown): LinkedAccount[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.filter((a): a is LinkedAccount => typeof a === "object" && a !== null) : [];
}
