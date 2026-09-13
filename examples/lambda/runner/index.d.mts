/**
 * Types for the deployed Lambda runner (FR-EXM-122). The runner itself is plain `.mjs`
 * so it can be zipped and shipped as-is; this declaration is what the tests typecheck
 * against, and it doubles as the written contract for what the function accepts.
 */

export interface RunnerEvent {
  width: number;
  height: number;
  iterations: number;
  centreX?: number;
  centreY?: number;
  scale?: number;
}

export interface RunnerTile {
  /** `data:image/png;base64,…` */
  png: string;
  width: number;
  height: number;
  iterations: number;
}

export type RunnerReply =
  | { ok: true; result: RunnerTile; ms: number; logs: string[] }
  | { ok: false; error: string; ms: number; logs: string[] };

/** Renders a Mandelbrot tile. Never executes caller-supplied code (BR-EXM-108). */
export function handler(event: unknown): Promise<RunnerReply>;
