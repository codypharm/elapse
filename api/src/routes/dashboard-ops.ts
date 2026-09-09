import { createRoute, z } from "@hono/zod-openapi";
import { config } from "../config";
import { sql } from "../db/client";
import { getMerchantProfile } from "../db/merchant-profile";
import { chainClient, RelayerUnavailable } from "../chain/relayer";
import { escrowTokenFor } from "../chain/deployments";
import { ApiError, invalid } from "../lib/errors";
import { csvCell } from "../lib/csv";
import { baseUnitsToDecimal } from "../lib/money";
import { router } from "../lib/openapi";
import { clientIp, sessionAuth, type AuthEnv } from "../middleware/auth";

/**
 * Dashboard-only operations, cookie auth (API FRD FR-API-106..111, FR-API-135 search):
 * ledger (+CSV), balance, payout address change, notifications, activity, delete test data.
 */
export const dashboardOps = router<AuthEnv>();
for (const p of ["/dashboard/search", "/dashboard/ledger", "/dashboard/balance", "/dashboard/payout_address", "/dashboard/notifications", "/dashboard/notifications/*", "/dashboard/activity", "/dashboard/test_data/*"]) {
  dashboardOps.use(p, sessionAuth());
}

const d = () => config.tokenDecimals;
const usd = (wei: string | number | bigint) => baseUnitsToDecimal(BigInt(wei), d());
const explorerBase = (chainId: number) => (chainId === 143 ? "https://monadscan.com" : "https://testnet.monadscan.com");

// ─── Ledger (FR-API-107) ───────────────────────────────────────────────────────

const LedgerRow = z.object({
  id: z.string(), object: z.literal("ledger_entry"), kind: z.enum(["deposit", "settlement", "fee", "refund"]), amount_usd: z.string(),
  subscription: z.string(), customer: z.string(), customer_email: z.string().nullable(), tx_hash: z.string(), log_index: z.number().int(),
  block_timestamp: z.number().int(), reversed_by: z.string().nullable(), livemode: z.boolean(),
});

/** FR-API-107 CSV: full range, capped so one request cannot pull the table unbounded. */
const LEDGER_CSV_MAX_ROWS = 10_000;

type LedgerFilter = { kind?: string | undefined; subscription?: string | undefined; from?: number | undefined; to?: number | undefined };

/** The filter as one reusable predicate fragment (merchant, mode, kind, subscription, range). */
function ledgerWhere(merchantId: string, livemode: boolean, q: LedgerFilter) {
  return sql`l.merchant_id = ${merchantId} AND l.livemode = ${livemode}
      AND (${q.kind ?? null}::text IS NULL OR l.kind = ${q.kind ?? null})
      AND (${q.subscription ?? null}::text IS NULL OR l.subscription_id = ${q.subscription ?? null})
      AND (${q.from ?? null}::bigint IS NULL OR l.block_timestamp >= ${q.from ?? null})
      AND (${q.to ?? null}::bigint IS NULL OR l.block_timestamp <= ${q.to ?? null})`;
}

/**
 * One page, newest first, FR-API-080 style: `limit + 1` rows so the caller knows `has_more`;
 * `startingAfter` is a ledger id whose `seq` bounds the page. Unknown cursor → `invalid`.
 */
async function ledgerRows(merchantId: string, livemode: boolean, q: LedgerFilter & { limit: number; startingAfter?: string | undefined }) {
  let afterSeq: string | null = null;
  if (q.startingAfter) {
    const [cursor] = await sql`SELECT seq::text AS seq FROM ledger_entries l WHERE l.id = ${q.startingAfter} AND l.merchant_id = ${merchantId} AND l.livemode = ${livemode}`;
    if (!cursor) throw invalid(`No such ledger entry: '${q.startingAfter}'`, "starting_after");
    afterSeq = cursor.seq as string;
  }
  return sql`
    SELECT l.id, l.kind, l.amount_wei::text AS amount_wei, l.subscription_id, l.customer_id, c.email AS customer_email, l.tx_hash, l.log_index, l.block_timestamp, l.reversed_by, l.livemode
    FROM ledger_entries l LEFT JOIN customers c ON c.id = l.customer_id
    WHERE ${ledgerWhere(merchantId, livemode, q)}
      AND (${afterSeq}::bigint IS NULL OR l.seq < ${afterSeq}::bigint)
    ORDER BY l.seq DESC LIMIT ${q.limit + 1}`;
}

/** Per-kind totals over the whole filtered range (live rows only), independent of the page. */
async function ledgerSummary(merchantId: string, livemode: boolean, q: LedgerFilter): Promise<Record<string, string>> {
  const rows = await sql`SELECT l.kind, COALESCE(SUM(l.amount_wei), 0)::text AS total FROM ledger_entries l
                         WHERE ${ledgerWhere(merchantId, livemode, q)} AND l.reversed_by IS NULL GROUP BY l.kind`;
  const summary: Record<string, string> = {};
  for (const kind of ["deposit", "settlement", "fee", "refund"]) {
    const hit = (rows as any[]).find((r) => r.kind === kind);
    summary[kind] = usd(hit ? BigInt(hit.total) : 0n);
  }
  return summary;
}

dashboardOps.openapi(
  createRoute({
    method: "get",
    path: "/dashboard/ledger",
    operationId: "dashboard.ledger",
    tags: ["Dashboard"],
    hide: true,
    request: {
      query: z.object({
        kind: z.enum(["deposit", "settlement", "fee", "refund"]).optional(),
        subscription: z.string().optional(),
        from: z.coerce.number().int().optional(),
        to: z.coerce.number().int().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(10),
        starting_after: z.string().optional(),
        format: z.enum(["json", "csv"]).default("json"),
      }),
    },
    responses: {
      200: { description: "Money movements newest first, paged per FR-API-080, with per-kind totals for the whole filtered range (live rows only).", content: { "application/json": { schema: z.object({ object: z.literal("list"), data: z.array(LedgerRow), has_more: z.boolean(), url: z.string(), summary: z.record(z.string(), z.string()) }) }, "text/csv": { schema: z.string() } } },
    },
  }),
  async (c) => {
    const auth = c.get("auth");
    const q = c.req.valid("query");
    // CSV is the whole filtered range (capped), never a page: a download that stops at 10 rows is a trap.
    const limit = q.format === "csv" ? LEDGER_CSV_MAX_ROWS : q.limit;
    const page = await ledgerRows(auth.merchantId, auth.livemode, { ...q, limit, startingAfter: q.format === "csv" ? undefined : q.starting_after });
    const hasMore = page.length > limit;
    const rows = hasMore ? (page as any[]).slice(0, limit) : (page as any[]);
    const data = rows.map((r) => ({
      id: r.id, object: "ledger_entry" as const, kind: r.kind, amount_usd: usd(r.amount_wei), subscription: r.subscription_id, customer: r.customer_id,
      customer_email: r.customer_email, tx_hash: r.tx_hash, log_index: r.log_index, block_timestamp: Number(r.block_timestamp), reversed_by: r.reversed_by, livemode: r.livemode,
    }));
    if (q.format === "csv") {
      const cols = ["id", "kind", "amount_usd", "subscription", "customer", "customer_email", "tx_hash", "log_index", "block_timestamp", "reversed_by"] as const;
      // FR-API-113: amounts are the only signed column; everything else gets the formula guard.
      const csv = [cols.join(","), ...data.map((r) => cols.map((k) => csvCell(r[k], { numeric: k === "amount_usd" })).join(","))].join("\n") + "\n";
      return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="elapse-ledger-${auth.livemode ? "live" : "test"}.csv"` });
    }
    const summary = await ledgerSummary(auth.merchantId, auth.livemode, q);
    return c.json({ object: "list" as const, data, has_more: hasMore, url: "/v1/dashboard/ledger", summary }, 200);
  },
);

// ─── Balance (FR-API-108) and payout address (FR-API-106) ─────────────────────

const BalanceSchema = z.object({ payout_address: z.string(), balance_usd: z.string(), settled_this_month_net_usd: z.string(), explorer_url: z.string(), as_of: z.number().int() });

dashboardOps.openapi(
  createRoute({
    method: "get",
    path: "/dashboard/balance",
    operationId: "dashboard.balance",
    tags: ["Dashboard"],
    hide: true,
    responses: { 200: { description: "Token balance at the payout address and this month's net settlements.", content: { "application/json": { schema: BalanceSchema } } } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const m = await getMerchantProfile(auth.merchantId);
    if (!m?.payout_address) throw new ApiError(404, "not_found", "Set a payout address first.", undefined, "no_payout_address");
    const chainId = auth.livemode ? config.chains.live : config.chains.test;
    let balance = 0n;
    try {
      balance = await chainClient().readBalance(chainId, escrowTokenFor(chainId, auth.livemode), m.payout_address as `0x${string}`);
    } catch (e) {
      if (!(e instanceof RelayerUnavailable)) throw e;
    }
    const [month] = await sql`SELECT COALESCE(sum(amount_wei - fee_wei), 0)::text AS net FROM invoices
                              WHERE merchant_id = ${auth.merchantId} AND livemode = ${auth.livemode} AND status = 'paid' AND period_end >= date_trunc('month', now())`;
    return c.json(
      { payout_address: m.payout_address, balance_usd: usd(balance), settled_this_month_net_usd: usd(month!.net), explorer_url: `${explorerBase(chainId)}/address/${m.payout_address}`, as_of: Math.floor(Date.now() / 1000) },
      200,
    );
  },
);

dashboardOps.openapi(
  createRoute({
    method: "post",
    path: "/dashboard/payout_address",
    operationId: "dashboard.payoutAddress",
    tags: ["Dashboard"],
    hide: true,
    request: { body: { content: { "application/json": { schema: z.strictObject({ address: z.string().regex(/^0x[0-9a-fA-F]{40}$/), confirm: z.string() }) } }, required: true } },
    responses: { 200: { description: "Applies to streams created from now on.", content: { "application/json": { schema: z.object({ payout_address: z.string() }) } } } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { address, confirm } = c.req.valid("json");
    if (confirm.toLowerCase() !== address.toLowerCase()) throw invalid("Re-type the address exactly to confirm.", "confirm");
    const lower = address.toLowerCase();
    await sql.begin(async (tx) => {
      await tx`UPDATE merchants SET payout_address = ${lower} WHERE id = ${auth.merchantId}`;
      await tx`INSERT INTO audit_log (merchant_id, actor, action, target, ip) VALUES (${auth.merchantId}, 'dashboard', 'payout_address_changed', ${lower}, ${clientIp(c)})`;
    });
    return c.json({ payout_address: lower }, 200);
  },
);

// ─── Notifications (FR-API-109) ───────────────────────────────────────────────

const NotificationSchema = z.object({ id: z.string(), kind: z.string(), summary: z.string(), target_id: z.string().nullable(), created: z.number().int(), read_at: z.number().int().nullable(), emailed_at: z.number().int().nullable(), livemode: z.boolean() });
const epoch = (x: Date | null) => (x ? Math.floor(x.getTime() / 1000) : null);

dashboardOps.openapi(
  createRoute({
    method: "get",
    path: "/dashboard/notifications",
    operationId: "dashboard.notifications",
    tags: ["Dashboard"],
    hide: true,
    responses: { 200: { description: "Notifications for the current mode, newest first, with unread counts.", content: { "application/json": { schema: z.object({ object: z.literal("list"), data: z.array(NotificationSchema), unread: z.number().int(), other_mode_unread: z.number().int() }) } } } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await sql`SELECT id, kind, summary, target_id, created_at, read_at, emailed_at, livemode FROM notifications WHERE merchant_id = ${auth.merchantId} AND livemode = ${auth.livemode} ORDER BY created_at DESC, id DESC LIMIT 100`;
    const [counts] = await sql`SELECT count(*) FILTER (WHERE livemode = ${auth.livemode})::int AS mine, count(*) FILTER (WHERE livemode <> ${auth.livemode})::int AS other
                               FROM notifications WHERE merchant_id = ${auth.merchantId} AND read_at IS NULL`;
    return c.json(
      { object: "list" as const, data: rows.map((r: any) => ({ id: r.id, kind: r.kind, summary: r.summary, target_id: r.target_id, created: epoch(r.created_at)!, read_at: epoch(r.read_at), emailed_at: epoch(r.emailed_at), livemode: r.livemode })), unread: counts!.mine, other_mode_unread: counts!.other },
      200,
    );
  },
);

dashboardOps.openapi(
  createRoute({ method: "post", path: "/dashboard/notifications/read_all", operationId: "dashboard.notifications.readAll", tags: ["Dashboard"], hide: true, responses: { 200: { description: "Marks the current mode's notifications read.", content: { "application/json": { schema: z.object({ read: z.number().int() }) } } } } }),
  async (c) => {
    const auth = c.get("auth");
    const rows = await sql`UPDATE notifications SET read_at = now() WHERE merchant_id = ${auth.merchantId} AND livemode = ${auth.livemode} AND read_at IS NULL RETURNING id`;
    return c.json({ read: rows.length }, 200);
  },
);

// ─── Activity (FR-API-110) ────────────────────────────────────────────────────

dashboardOps.openapi(
  createRoute({
    method: "get",
    path: "/dashboard/activity",
    operationId: "dashboard.activity",
    tags: ["Dashboard"],
    hide: true,
    request: { query: z.object({ action: z.string().max(64).optional(), since: z.coerce.number().int().optional(), until: z.coerce.number().int().optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }) },
    responses: { 200: { description: "Audit log, newest first.", content: { "application/json": { schema: z.object({ object: z.literal("list"), data: z.array(z.object({ id: z.string(), at: z.number().int(), actor: z.string(), action: z.string(), target: z.string().nullable(), ip: z.string().nullable() })) }) } } } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const q = c.req.valid("query");
    const rows = await sql`SELECT id, at, actor, action, target, ip FROM audit_log WHERE merchant_id = ${auth.merchantId}
                           AND (${q.action ?? null}::text IS NULL OR action = ${q.action ?? null})
                           AND (${q.since ?? null}::bigint IS NULL OR at >= to_timestamp(${q.since ?? null}))
                           AND (${q.until ?? null}::bigint IS NULL OR at <= to_timestamp(${q.until ?? null}))
                           ORDER BY at DESC, id DESC LIMIT ${q.limit}`;
    return c.json({ object: "list" as const, data: rows.map((r: any) => ({ id: `aud_${r.id}`, at: epoch(r.at)!, actor: r.actor, action: r.action, target: r.target, ip: r.ip })) }, 200);
  },
);

// ─── Delete test data (FR-API-111) ────────────────────────────────────────────

dashboardOps.openapi(
  createRoute({
    method: "post",
    path: "/dashboard/test_data/delete",
    operationId: "dashboard.testData.delete",
    tags: ["Dashboard"],
    hide: true,
    request: { body: { content: { "application/json": { schema: z.strictObject({ confirm_name: z.string() }) } }, required: true } },
    responses: { 200: { description: "Every test-mode row for the merchant is gone; live rows and test keys stay.", content: { "application/json": { schema: z.object({ deleted: z.literal(true) }) } } } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const { confirm_name } = c.req.valid("json");
    const m = await getMerchantProfile(auth.merchantId);
    if (!m || confirm_name.trim() !== m.name) throw invalid("Type your business name exactly to confirm.", "confirm_name");
    const id = auth.merchantId;
    await sql.begin(async (tx) => {
      // Order respects foreign keys; every table carries livemode so live rows are untouched (BR-API-001).
      await tx`DELETE FROM delivery_attempts WHERE delivery_id IN (SELECT d.id FROM deliveries d JOIN events e ON e.id = d.event_id WHERE e.merchant_id = ${id} AND e.livemode = false)`;
      await tx`DELETE FROM deliveries WHERE event_id IN (SELECT id FROM events WHERE merchant_id = ${id} AND livemode = false)`;
      await tx`DELETE FROM events WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM ledger_entries WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM invoices WHERE merchant_id = ${id} AND livemode = false`;
      await tx`UPDATE chain_events SET subscription_id = NULL WHERE subscription_id IN (SELECT id FROM subscriptions WHERE merchant_id = ${id} AND livemode = false)`;
      await tx`UPDATE checkout_sessions SET subscription_id = NULL, customer_id = NULL WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM subscriptions WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM checkout_sessions WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM customers WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM webhook_endpoints WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM notifications WHERE merchant_id = ${id} AND livemode = false`;
      await tx`DELETE FROM products WHERE merchant_id = ${id} AND livemode = false`;
      await tx`INSERT INTO audit_log (merchant_id, actor, action, target, ip) VALUES (${id}, 'dashboard', 'test_data.deleted', NULL, ${clientIp(c)})`;
    });
    return c.json({ deleted: true as const }, 200);
  },
);

// ── FR-API-135: search as you type ──

const SearchRowSchema = z.object({
  type: z.enum(["product", "customer", "subscription", "event", "endpoint", "checkout_session"]),
  id: z.string(),
  label: z.string().openapi({ description: "Product name, customer email, or the id." }),
  detail: z.string().openapi({ description: "One line of context: rate, status, event type, endpoint host." }),
});
export type SearchRow = z.infer<typeof SearchRowSchema>;
const SEARCH_LIMIT = 5;

/**
 * At most five rows across the six object types for one merchant and mode. Ids match by prefix
 * with `left()`, never LIKE, because every id has an underscore. Names and emails match anywhere,
 * case-insensitively. Nothing here reads a key, a secret blob, or an event payload.
 */
export async function searchObjects(merchantId: string, livemode: boolean, q: string): Promise<SearchRow[]> {
  const n = q.length;
  const rows = await sql<{ type: SearchRow["type"]; id: string; label: string; detail: string; rank: number }[]>`
    SELECT * FROM (
      SELECT 'product' AS type, id, name AS label, '$' || trim(trailing '.' from trim(trailing '0' from rate_usd_per_second::text)) || ' per second' || CASE WHEN active THEN '' ELSE ' · archived' END AS detail, 1 AS rank, created_at
        FROM products WHERE merchant_id = ${merchantId} AND livemode = ${livemode} AND (left(id, ${n}) = ${q} OR position(lower(${q}) in lower(name)) > 0)
      UNION ALL
      SELECT 'customer', id, COALESCE(email, id), CASE WHEN email IS NULL THEN 'no email' ELSE '' END, 2, created_at
        FROM customers WHERE merchant_id = ${merchantId} AND livemode = ${livemode} AND (left(id, ${n}) = ${q} OR position(lower(${q}) in lower(COALESCE(email, ''))) > 0)
      UNION ALL
      SELECT 'subscription', s.id, s.id, s.status || ' · ' || COALESCE(c.email, c.id) || ' · ' || p.name, 3, s.created_at
        FROM subscriptions s JOIN customers c ON c.id = s.customer_id JOIN products p ON p.id = s.product_id
        WHERE s.merchant_id = ${merchantId} AND s.livemode = ${livemode} AND left(s.id, ${n}) = ${q}
      UNION ALL
      SELECT 'event', id, id, type, 4, created
        FROM events WHERE merchant_id = ${merchantId} AND livemode = ${livemode} AND left(id, ${n}) = ${q}
      UNION ALL
      SELECT 'endpoint', id, id, regexp_replace(url, '^https?://([^/]+).*$', '\\1') || CASE WHEN disabled THEN ' · disabled' ELSE '' END, 5, created_at
        FROM webhook_endpoints WHERE merchant_id = ${merchantId} AND livemode = ${livemode} AND left(id, ${n}) = ${q}
      UNION ALL
      SELECT 'checkout_session', cs.id, cs.id, cs.status || ' · ' || p.name, 6, cs.created_at
        FROM checkout_sessions cs JOIN products p ON p.id = cs.product_id
        WHERE cs.merchant_id = ${merchantId} AND cs.livemode = ${livemode} AND left(cs.id, ${n}) = ${q}
    ) hits
    ORDER BY rank, created_at DESC
    LIMIT ${SEARCH_LIMIT}`;
  return rows.map(({ type, id, label, detail }) => ({ type, id, label, detail }));
}

dashboardOps.openapi(
  createRoute({
    method: "get",
    path: "/dashboard/search",
    operationId: "dashboard.search",
    tags: ["Dashboard"],
    hide: true,
    request: { query: z.object({ q: z.string().max(254) }) },
    responses: { 200: { description: "Up to five matches in the current mode.", content: { "application/json": { schema: z.object({ object: z.literal("list"), data: z.array(SearchRowSchema) }) } } } },
  }),
  async (c) => {
    const auth = c.get("auth");
    const q = c.req.valid("query").q.trim();
    if (q.length < 2) throw invalid("Type at least two characters.", "q");
    return c.json({ object: "list" as const, data: await searchObjects(auth.merchantId, auth.livemode, q) }, 200);
  },
);
