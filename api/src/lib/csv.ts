/**
 * One CSV cell (FR-API-113). Quotes on `"`, `,` or newline as before, and prefixes a cell whose
 * text begins with `=`, `+`, `-`, `@`, tab or CR with a single quote so a merchant-typed value
 * never runs as a formula when the export opens in a spreadsheet. A column the caller marks
 * numeric keeps its sign.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: unknown, opts: { numeric?: boolean } = {}): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (!opts.numeric && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
