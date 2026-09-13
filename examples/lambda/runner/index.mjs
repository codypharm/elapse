/**
 * Elapse example — the Lambda runner (FR-EXM-122).
 *
 * Executes caller-supplied JavaScript inside the Lambda microVM and returns what it
 * returned, plus anything it logged. The isolation boundary is AWS Lambda itself plus a
 * zero-permission execution role and a clamped timeout.
 *
 * This is a DEMO runner, not a hardened sandbox: a Lambda outside a VPC still has
 * outbound internet, so do not expose it to untrusted users as-is.
 *
 * Event:  { code: string }   // the body of an async function; use `return`
 * Reply:  { ok, result|error, ms, logs }
 */
import { createRequire } from "node:module";
// Submitted code gets a real `require`. Dynamic `import()` works on Lambda but depends on the
// host providing an import callback (it is absent under some test runners), so `require` is the
// dependable way to reach node builtins and we do not rely on `import()` in anything we ship.
const requireModule = createRequire(import.meta.url);

export const handler = async (event) => {
  const code = event && typeof event === "object" && typeof event.code === "string" ? event.code : "";
  const started = Date.now();
  const logs = [];
  const sandboxConsole = {
    log: (...a) => logs.push(a.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(" ")),
  };
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("console", "require", `"use strict"; return (async () => { ${code} })();`);
    const result = await fn(sandboxConsole, requireModule);
    return { ok: true, result: result === undefined ? null : result, ms: Date.now() - started, logs };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e), ms: Date.now() - started, logs };
  }
};
