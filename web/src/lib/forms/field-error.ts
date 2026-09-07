/**
 * Maps a server rejection to the field it names (FR-DSH-115). The API sets `error.param` on
 * every schema failure (FR-API-082) and the client keeps it on the thrown error; a form passes
 * the params it owns with the copy to show. Returns null when the error names no field the
 * form knows, so the caller falls back to its toast.
 *
 * @param err - Whatever was thrown; only an Error with a string `param` can match.
 * @param fields - `param` → message, or `param` → function of the API's message.
 */
export type FieldCopy = string | ((apiMessage: string) => string);

export function fieldError(err: unknown, fields: Record<string, FieldCopy>): { field: string; message: string } | null {
  if (!(err instanceof Error)) return null;
  const param = (err as { param?: unknown }).param;
  if (typeof param !== "string") return null;
  const copy = fields[param];
  if (copy === undefined) return null;
  return { field: param, message: typeof copy === "function" ? copy(err.message) : copy };
}
