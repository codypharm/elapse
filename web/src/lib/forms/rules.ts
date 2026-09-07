/**
 * Field rules the API enforces, mirrored once so every form refuses exactly what the server
 * refuses (FR-DSH-114). Each rule carries the attributes an `<input>` should wear
 * (`maxLength`, `pattern`, `inputMode`) and `check`, which returns the form's own copy for
 * the first broken rule or `null` when the trimmed value is acceptable.
 *
 * Sources: `api/src/routes/dashboard-me.ts`, `products.ts`, `api-keys.ts`,
 * `webhook-endpoints.ts`, `checkout-sessions.ts` (MIN_CAP 60 s, MAX_CAP 30 d).
 * Maps to: dashboard FRD FR-DSH-114, checkout FRD FR-CHK-028.
 */

export interface Rule {
  /** Attribute for the input; also the upper bound `check` enforces. */
  maxLength?: number;
  /** HTML `pattern` attribute (without anchors), when a regex describes the whole value. */
  pattern?: string;
  inputMode?: "text" | "numeric" | "decimal" | "email" | "url";
  /**
   * What the field accepts while typing: a prefix that could still become a valid value.
   * Numeric fields refuse letters, a second dot or a seventh decimal at the keystroke
   * instead of accepting them and complaining afterwards. Absent = accept anything.
   */
  accept?: RegExp;
  /** Returns the message for the first broken rule, or null. Receives the trimmed value. */
  check: (value: string) => string | null;
}

/** Trim, then run the rule. */
export function check(rule: Rule, value: string): string | null {
  return rule.check(value.trim());
}

/**
 * The value a controlled input should hold after a change: `next` when the rule accepts it as
 * a prefix, otherwise the longest acceptable extension of `previous` (so a paste keeps its
 * usable characters and a refused keystroke changes nothing).
 */
export function accepted(rule: Rule, previous: string, next: string): string {
  if (!rule.accept) return next;
  if (rule.accept.test(next)) return next;
  // A paste of several characters: keep the longest acceptable prefix built from `previous`.
  let kept = previous;
  for (const ch of next.slice(previous.length)) {
    if (rule.accept.test(kept + ch)) kept += ch;
  }
  return rule.accept.test(kept) ? kept : previous;
}

const tooLong = (n: number) => `Keep it under ${n} characters.`;

function text(maxLength: number, empty: string | null): Rule {
  return {
    maxLength,
    check: (v) => (v.length === 0 ? empty : v.length > maxLength ? tooLong(maxLength) : null),
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ACCENT = /^#[0-9a-fA-F]{6}$/;
const RATE = /^(0|[1-9]\d*)(\.\d+)?$/;
const WHOLE = /^\d+$/;
const CODE = /^\d{6}$/;
/** Server bounds on the cap (FR-API-032): 60 s to 30 days, in whole minutes here. */
export const CAP_MIN_MINUTES = 1;
export const CAP_MAX_MINUTES = 43_200;
/** Token decimals: AUSD and MockUSD are 6-decimal tokens, so a rate finer than that is not representable. */
export const RATE_DECIMALS = 6;

const url: Rule = {
  maxLength: 2048,
  inputMode: "url",
  check: (v) => {
    if (v.length === 0) return "Enter a link.";
    if (v.length > 2048) return tooLong(2048);
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return "Enter a link starting with https://.";
    }
    return u.protocol === "https:" || u.protocol === "http:" ? null : "Enter a link starting with https://.";
  },
};

export const rules = {
  businessName: text(80, "Enter a business name."),
  keyName: text(100, "Enter a name."),
  productName: text(200, "Enter a product name."),
  description: text(1000, null),
  email: {
    maxLength: 254,
    inputMode: "email",
    check: (v) => (v.length === 0 ? "Enter your email address." : v.length > 254 || !EMAIL.test(v) ? "Enter a valid email address." : null),
  } satisfies Rule as Rule,
  url,
  /** Webhook endpoint URLs: same shape as any link; live mode's https-only rule stays on the server (FR-API-062). */
  endpointUrl: url,
  address: {
    maxLength: 42,
    pattern: "0x[0-9a-fA-F]{40}",
    check: (v) => (v.length === 0 ? "Enter an address." : ADDRESS.test(v) ? null : "An address is 0x followed by 40 hex characters."),
  } satisfies Rule as Rule,
  accent: {
    maxLength: 7,
    pattern: "#[0-9a-fA-F]{6}",
    check: (v) => (ACCENT.test(v) ? null : "Use a colour like #1D4ED8."),
  } satisfies Rule as Rule,
  rate: {
    maxLength: 20,
    inputMode: "decimal",
    accept: /^\d*(\.\d{0,6})?$/,
    check: (v) => {
      if (!RATE.test(v)) return "Enter a decimal like 0.004.";
      const decimals = v.split(".")[1]?.length ?? 0;
      if (decimals > RATE_DECIMALS) return `Use at most ${RATE_DECIMALS} decimal places.`;
      if (!/[1-9]/.test(v)) return "The rate must be more than zero.";
      return null;
    },
  } satisfies Rule as Rule,
  capMinutes: {
    maxLength: 5,
    inputMode: "numeric",
    pattern: "[0-9]*",
    accept: /^\d*$/,
    check: (v) => {
      if (!WHOLE.test(v)) return "Enter whole minutes.";
      const n = Number(v);
      return n >= CAP_MIN_MINUTES && n <= CAP_MAX_MINUTES ? null : "Between 1 minute and 30 days.";
    },
  } satisfies Rule as Rule,
  code: {
    maxLength: 6,
    inputMode: "numeric",
    pattern: "[0-9]*",
    accept: /^\d*$/,
    check: (v) => (CODE.test(v) ? null : "Enter the 6-digit code."),
  } satisfies Rule as Rule,
  /** The same rule, but an empty value is acceptable (a field the merchant may leave blank). */
  optional: (rule: Rule): Rule => ({ ...rule, check: (v) => (v.length === 0 ? null : rule.check(v)) }),
};

/** The form's copy for the server's endpoint-URL rejections (FR-API-062/065), keyed on the API's own wording. */
export function endpointUrlCopy(apiMessage: string): string {
  if (/https in live mode/.test(apiMessage)) return "Live endpoints need https://.";
  if (/local or internal/.test(apiMessage)) return "Point this at a public address, not a local or internal one.";
  if (/2048/.test(apiMessage)) return "Keep it under 2048 characters.";
  return "Enter a link starting with https://.";
}
