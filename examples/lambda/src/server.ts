import { readFileSync } from "node:fs";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Executor } from "./executor";
import { handleWebhook, type SessionStore } from "./webhooks";

/**
 * FR-EXM-110–120: the merchant's HTTP server on Node's built-in module (no framework, so the
 * webhook body arrives raw). The subscriber never presses Start or Stop: the first `/run`
 * begins the session (FR-EXM-114) and the server ends it by itself (FR-EXM-117/118).
 *
 * Every platform call is injected as a function so the routes test without an API or AWS.
 */

export interface ServerDeps {
  sessions: SessionStore;
  executor: Executor;
  webhookSecret: string;
  log: (line: string) => void;
  logJson?: boolean;
  /** `checkout.sessions.create` with the session cap, behind a function (FR-EXM-114). */
  createCheckoutSession: () => Promise<{ id: string; url: string }>;
  /** `subscriptions.cancel`, behind a function (BR-EXM-110). */
  cancelSubscription: (sub: string) => Promise<void>;
  product: { name: string; rateUsdPerSecond: string };
  now: () => number;
}

/** FR-EXM-110/111/112: the merchant's own pages (ADR 2026-09-06), plain files under public/. */
const asset = (name: string) => readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");
const LANDING = asset("index.html");
const CONSOLE = asset("console.html");
const CANCEL = asset("cancel.html");
const STYLE = asset("northwind.css");
const MERCHANT = "Northwind Compute";
const escapeHtml = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => escapeHtml(vars[k] ?? ""));
/** Display only; the money that matters is settled on the platform (BR-EXM-106). */
const hourly = (rate: string) => (Number(rate) * 3600).toFixed(2);

export function createServer(deps: ServerDeps) {
  return createHttpServer((req, res) => {
    route(req, res, deps).catch((err: Error) => {
      deps.log(`✗ ${req.method} ${req.url}: ${err.message}`);
      if (!res.headersSent) send(res, 500, "text/plain", "Something went wrong.");
    });
  });
}

async function route(req: IncomingMessage, res: ServerResponse, deps: ServerDeps): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  // FR-EXM-120: run code, but only inside a session that is actually running.
  if (req.method === "POST" && url.pathname === "/run") {
    const sub = url.searchParams.get("sub") ?? "";
    if (!deps.sessions.isActive(sub)) {
      // FR-EXM-114: no session yet — hand back a Checkout URL; the console redirects,
      // the subscriber authorises once, and the stashed code runs on return.
      const session = await deps.createCheckoutSession();
      return send(res, 409, "application/json", JSON.stringify({ needs_start: true, checkout_url: session.url }));
    }
    const { code } = JSON.parse(await readRaw(req)) as { code?: string };
    const now = deps.now();
    // BR-EXM-109: the cost guard is checked before the runner is ever reached.
    if (!deps.sessions.tryConsumeRun(now)) {
      return send(res, 429, "application/json", JSON.stringify({ error: "daily execution limit reached" }));
    }
    deps.sessions.touch(sub, now, { run: true });
    const result = await deps.executor.run(code ?? "");
    return send(res, 200, "application/json", JSON.stringify(result));
  }

  const vars = {
    merchant: MERCHANT,
    product: deps.product.name,
    price: `$${deps.product.rateUsdPerSecond} / second · ~$${hourly(deps.product.rateUsdPerSecond)} / hour`,
    rate: deps.product.rateUsdPerSecond,
  };
  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, "text/html; charset=utf-8", fill(LANDING, vars));
  }
  if (req.method === "GET" && url.pathname === "/console") {
    return send(res, 200, "text/html; charset=utf-8", fill(CONSOLE, vars));
  }
  if (req.method === "GET" && url.pathname === "/cancel") {
    return send(res, 200, "text/html; charset=utf-8", fill(CANCEL, vars));
  }
  if (req.method === "GET" && url.pathname === "/northwind.css") {
    return send(res, 200, "text/css; charset=utf-8", STYLE);
  }

  // FR-EXM-114: the console polls this coming back from Checkout to learn its session.
  const resuming = url.pathname.match(/^\/session\/([\w-]+)$/);
  if (req.method === "GET" && resuming) {
    const sub = deps.sessions.subForCheckout(resuming[1] as string);
    if (!sub) return send(res, 404, "application/json", JSON.stringify({ error: "not found" }));
    return send(res, 200, "application/json", JSON.stringify({ sub }));
  }

  // FR-EXM-113: is this session running, and if it has ended, what did it actually cost?
  // The figure here is the settled receipt from the webhook, not the console's ticking estimate.
  const access = url.pathname.match(/^\/access\/([\w-]+)$/);
  if (req.method === "GET" && access) {
    const session = deps.sessions.get(access[1] as string);
    if (!session) return send(res, 200, "application/json", JSON.stringify({ active: false, reason: "unknown session" }));
    if (session.active)
      return send(
        res,
        200,
        "application/json",
        JSON.stringify({ active: true, reason: "running", ...(session.startedAt === undefined ? {} : { started_at: Math.floor(session.startedAt / 1000) }) }),
      );
    return send(
      res,
      200,
      "application/json",
      JSON.stringify({
        active: false,
        reason: "ended",
        ...(session.secondsElapsed === undefined ? {} : { seconds_elapsed: session.secondsElapsed }),
        ...(session.paidUsd === undefined ? {} : { paid_usd: session.paidUsd }),
      }),
    );
  }

  // FR-EXM-116: the console says "still here" every few seconds while it is open.
  if (req.method === "POST" && url.pathname === "/heartbeat") {
    deps.sessions.touch(url.searchParams.get("sub") ?? "", deps.now());
    return send(res, 204, "text/plain", "");
  }

  // FR-EXM-118: the tab-close beacon — end now rather than waiting for the sweep.
  if (req.method === "POST" && url.pathname === "/end") {
    await endSession(url.searchParams.get("sub") ?? "", "left", deps);
    return send(res, 204, "text/plain", "");
  }

  // FR-EXM-130: verify the raw bytes, answer fast, then do the merchant work (BR-EXM-102).
  // The webhook is the source of truth for whether a session is open (FR-EXM-132).
  if (req.method === "POST" && url.pathname === "/webhooks") {
    const raw = await readRaw(req);
    const header = req.headers["x-elapse-signature"];
    const out = handleWebhook(raw, Array.isArray(header) ? header[0] : header, {
      secret: deps.webhookSecret,
      sessions: deps.sessions,
      log: deps.log,
      now: deps.now,
      ...(deps.logJson === undefined ? {} : { logJson: deps.logJson }),
    });
    send(res, out.status, "application/json", out.body);
    if (out.work) setImmediate(out.work);
    return;
  }

  send(res, 404, "text/plain", "Not found");
}

/** The exact bytes the platform signed; never JSON-parse before verifying (BR-SDK-003). */
function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  if (status === 204) {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
  res.end(body);
}

/**
 * FR-EXM-117/118: end a session server-side, at most once. The `canceling` flag is set before
 * the await so a second beacon or the next sweep tick cannot issue a second cancel while the
 * chain confirms; the `subscription.canceled` webhook is what finally closes it (BR-EXM-110).
 */
export async function endSession(sub: string, reason: "left" | "idle", deps: ServerDeps): Promise<void> {
  const session = deps.sessions.get(sub);
  if (!session?.active || session.canceling) return;
  deps.sessions.markCanceling(sub);
  deps.log(`⏹ auto-ended (${reason}) ${sub}`);
  await deps.cancelSubscription(sub);
}

/**
 * FR-EXM-117: one tick of the auto-end sweep, which the boot script runs on a timer. The store
 * decides *which* sessions are due and *why*; this only carries the decision out, so the timing
 * rules stay testable without a server, a clock, or the SDK.
 */
export async function sweepOnce(
  deps: ServerDeps,
  nowMs: number,
  windows: { idleTimeoutMs: number; heartbeatStaleMs: number },
): Promise<void> {
  for (const { sub, reason } of deps.sessions.dueForAutoEnd(nowMs, windows)) {
    await endSession(sub, reason, deps);
  }
}
