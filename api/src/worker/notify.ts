/**
 * Dashboard notifications the worker writes (API FR-API-109, worker FR-WRK-042) and the emails
 * behind the merchant's two switches (dashboard FR-DSH-105/132): `first_delivery_succeeded`,
 * `key_expiring`, `secret_expiring`, and the mail for `endpoint_exhausted`. Each notice carries a
 * `dedupe_key` so a restart or an overlapping sweep can never write it twice. Mail goes out after
 * the row is committed; a failed send is logged and leaves `emailed_at` empty.
 */
import { config } from "../config";
import { sql } from "../db/client";
import { sendEmail } from "../lib/email";
import { newId } from "../lib/ids";
import { noticeMail } from "../lib/mail-templates";
import { sleep } from "./sleep";

export type NoticeKind = "first_delivery_succeeded" | "key_expiring" | "secret_expiring" | "endpoint_exhausted";

export interface Notice {
  merchantId: string;
  livemode: boolean;
  kind: NoticeKind;
  summary: string;
  targetId: string;
  /** Unique per merchant; a second write with the same key is a no-op. */
  dedupeKey?: string;
}

type Tx = typeof sql;

/** Insert one notice; returns its id, or null when `dedupeKey` already exists for the merchant. */
export async function writeNotice(tx: Tx, n: Notice): Promise<string | null> {
  const id = newId("ntf");
  const rows = await tx`INSERT INTO notifications (id, merchant_id, livemode, kind, summary, target_id, dedupe_key)
                        VALUES (${id}, ${n.merchantId}, ${n.livemode}, ${n.kind}, ${n.summary}, ${n.targetId}, ${n.dedupeKey ?? null})
                        ON CONFLICT (merchant_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
                        RETURNING id`;
  return rows.length ? id : null;
}

const dashboard = () => new URL(config.checkoutBaseUrl).origin;

const MAIL: Partial<Record<NoticeKind, { switch: "notify_key_expiry" | "notify_endpoint_exhausted"; subject: string; heading: string; action: string; path: (target: string) => string }>> = {
  key_expiring: { switch: "notify_key_expiry", subject: "An Elapse API key is about to expire", heading: "API key expiring", action: "Open API keys", path: () => "/dashboard/developers/keys" },
  secret_expiring: { switch: "notify_key_expiry", subject: "An Elapse signing secret is about to expire", heading: "Signing secret expiring", action: "Open the endpoint", path: (t) => `/dashboard/developers/webhooks/${t}` },
  endpoint_exhausted: { switch: "notify_endpoint_exhausted", subject: "An Elapse webhook endpoint was disabled", heading: "Webhook endpoint disabled", action: "Open the endpoint", path: (t) => `/dashboard/developers/webhooks/${t}` },
};

/**
 * Email a committed notice when its kind has a mail and the merchant's switch is on; stamp
 * `emailed_at` on success. Never throws: the notice already exists, the mail is best effort.
 */
export async function emailNotice(id: string | null, log: (e: Record<string, unknown>) => void = console.error): Promise<void> {
  if (!id) return;
  const [n] = await sql`SELECT n.kind, n.summary, n.target_id, m.email, m.notify_key_expiry, m.notify_endpoint_exhausted
                        FROM notifications n JOIN merchants m ON m.id = n.merchant_id WHERE n.id = ${id} AND n.emailed_at IS NULL`;
  if (!n) return;
  const spec = MAIL[n.kind as NoticeKind];
  if (!spec || !n[spec.switch]) return;
  try {
    const mail = noticeMail({ subject: spec.subject, heading: spec.heading, summary: n.summary, action: spec.action, link: `${dashboard()}${spec.path(n.target_id)}`, logoUrl: `${dashboard()}/apple-icon.png` });
    await sendEmail({ to: n.email, ...mail });
    await sql`UPDATE notifications SET emailed_at = now() WHERE id = ${id} AND emailed_at IS NULL`;
  } catch (e) {
    log({ msg: "notification email failed", notification_id: id, kind: n.kind, error: (e as Error).message });
  }
}

/** Each band excludes the tighter one, so a target thirty minutes from expiry gets the 1 h notice only. */
const THRESHOLDS = [
  { key: "24h", fromMs: 3_600_000, toMs: 24 * 3_600_000, word: "24 hours" },
  { key: "1h", fromMs: 0, toMs: 3_600_000, word: "1 hour" },
] as const;

/**
 * FR-WRK-042: one pass over keys and endpoint secrets whose expiry falls inside the next 24 h or
 * the next 1 h; writes each (target, threshold) notice once and emails it. Returns notices written.
 */
export async function expirySweep(now: Date, log: (e: Record<string, unknown>) => void = console.error): Promise<number> {
  let written = 0;
  for (const t of THRESHOLDS) {
    const from = new Date(now.getTime() + t.fromMs);
    const until = new Date(now.getTime() + t.toMs);
    const keys = await sql`SELECT id, merchant_id, livemode, name, last4 FROM api_keys
                           WHERE kind = 'sk' AND revoked_at IS NULL AND expires_at > ${from} AND expires_at <= ${until}`;
    for (const k of keys) {
      const id = await writeNotice(sql, {
        merchantId: k.merchant_id, livemode: k.livemode, kind: "key_expiring", targetId: k.id, dedupeKey: `key_expiring:${k.id}:${t.key}`,
        summary: `The old ${k.livemode ? "live" : "test"} secret key ending in ${k.last4} stops working in ${t.word}. Anything still using it will get 401.`,
      });
      if (id) { written++; await emailNotice(id, log); }
    }
    const eps = await sql`SELECT id, merchant_id, livemode, url FROM webhook_endpoints
                          WHERE previous_secret_expires_at > ${from} AND previous_secret_expires_at <= ${until}`;
    for (const e of eps) {
      const id = await writeNotice(sql, {
        merchantId: e.merchant_id, livemode: e.livemode, kind: "secret_expiring", targetId: e.id, dedupeKey: `secret_expiring:${e.id}:${t.key}`,
        summary: `The previous signing secret for ${hostOf(e.url)} stops signing in ${t.word}. Verify with the new secret before then.`,
      });
      if (id) { written++; await emailNotice(id, log); }
    }
  }
  return written;
}

/** Runs the sweep every minute for the worker's lifetime; a failing pass is logged, never fatal. */
export async function expiryForever(signal?: AbortSignal, log: (e: Record<string, unknown>) => void = console.error, everyMs = 60_000): Promise<void> {
  while (!signal?.aborted) {
    try {
      const n = await expirySweep(new Date(), log);
      if (n > 0) log({ msg: "expiry notices written", count: n });
    } catch (e) {
      console.error("expiry sweep failed", { message: (e as Error).message });
    }
    await sleep(everyMs, signal);
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
