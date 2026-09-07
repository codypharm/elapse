/**
 * FR-CHK-027: which identity token a binding call sends.
 *
 * The Privy SDK keeps the current identity token in memory and refreshes it with the session
 * in the background. Reading that copy costs nothing; the SDK's `getIdentityToken()` instead
 * calls Privy's user endpoint every time, which is rate-limited tightly and threw
 * "Too many requests" on the first real run (2026-09-07). So: send the held token while it has
 * more than a minute left, and ask Privy only when it is missing, unreadable, or about to expire.
 */

const MARGIN_MS = 60_000;

/** `exp` of a JWT in milliseconds, or null when the string is not a readable JWT. */
export function tokenExpiry(token: string | null | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function freshIdentityToken(o: {
  /** What the SDK holds right now (the `useIdentityToken` value). */
  held: string | null | undefined;
  /** Ask Privy for a current token; may throw or return null when nobody is signed in. */
  refresh: () => Promise<string | null | undefined>;
  now?: number;
}): Promise<string | null> {
  const now = o.now ?? Date.now();
  const exp = tokenExpiry(o.held);
  if (o.held && exp !== null && exp - now > MARGIN_MS) return o.held;
  try {
    return (await o.refresh()) ?? null;
  } catch {
    return null;
  }
}
