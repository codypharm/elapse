/**
 * Types for the deployed Lambda runner (FR-EXM-122). The runner itself is plain `.mjs`
 * so it can be zipped and shipped as-is; this declaration is what the tests typecheck
 * against, and it doubles as the written contract for what the function accepts.
 */

export interface RunnerEvent {
  /** The body of an async function. Use `return` to produce a value. */
  code: string;
}

export type RunnerReply =
  | { ok: true; result: unknown; ms: number; logs: string[] }
  | { ok: false; error: string; ms: number; logs: string[] };

/** Executes caller-supplied JavaScript inside the Lambda microVM. */
export function handler(event: unknown): Promise<RunnerReply>;
