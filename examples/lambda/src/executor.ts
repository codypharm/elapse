import { InvokeCommand } from "@aws-sdk/client-lambda";

/**
 * FR-EXM-121: the code executor as a deep module. One interface, two implementations:
 * `awsRunner` invokes the real Lambda runner; `mockRunner` is a deterministic, network-free
 * seam for tests and CI (BR-EXM-108: code never runs in this process).
 */

/** The structured request the runner accepts. It clamps these; we never send code. */
export interface RunInput {
  width: number;
  height: number;
  iterations: number;
  centreX?: number;
  centreY?: number;
  scale?: number;
}

export interface RunTile {
  /** `data:image/png;base64,…` */
  png: string;
  width: number;
  height: number;
  iterations: number;
}

export type RunResult =
  | { ok: true; result: RunTile; ms: number; logs: string[] }
  | { ok: false; error: string; ms: number; logs: string[] };

export interface Executor {
  run(input: RunInput): Promise<RunResult>;
}

/** A 1x1 PNG, so the mock is deterministic and needs no renderer of its own. */
const STUB_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Deterministic, no network. Used only in tests/CI (LAMBDA_RUNNER_MODE=mock). */
export function mockRunner(): Executor {
  return {
    async run(input: RunInput): Promise<RunResult> {
      return {
        ok: true,
        result: { png: STUB_PNG, width: input.width, height: input.height, iterations: input.iterations },
        ms: 0,
        logs: [],
      };
    },
  };
}


/** The slice of the Lambda client awsRunner uses, so tests can inject a fake. */
export interface Invoker {
  // The AWS SDK really does hand these back as possibly-undefined, so say so rather than
  // casting at the call site (the package is built with exactOptionalPropertyTypes).
  send(command: InvokeCommand): Promise<{
    Payload?: Uint8Array | undefined;
    FunctionError?: string | undefined;
    StatusCode?: number | undefined;
  }>;
}

/** Invokes the real Lambda runner (FR-EXM-122) and returns its RunResult. */
export function awsRunner(opts: { client: Invoker; fnName: string }): Executor {
  return {
    async run(input: RunInput): Promise<RunResult> {
      const command = new InvokeCommand({
        FunctionName: opts.fnName,
        Payload: new TextEncoder().encode(JSON.stringify(input)),
      });
      let resp;
      try {
        resp = await opts.client.send(command);
      } catch (e) {
        // Never leak a raw AWS stack to the subscriber (FR-EXM-123).
        const err = e as { name?: string; message?: string };
        const busy = err.name === "TooManyRequestsException";
        const first = (err.message ?? "the runner is unavailable").split("\n")[0]!;
        return { ok: false, error: busy ? `the runner is busy: ${first}` : first, ms: 0, logs: [] };
      }
      const text = resp.Payload ? new TextDecoder().decode(resp.Payload) : "";
      if (resp.FunctionError) {
        // Lambda killed the invocation (timeout / crash). Payload is an AWS error object.
        let message = "the runner failed";
        try {
          const parsed = JSON.parse(text) as { errorMessage?: string };
          if (parsed.errorMessage) message = parsed.errorMessage;
        } catch {
          /* keep the default */
        }
        const error = /timed out/i.test(message) ? "execution timed out" : message;
        return { ok: false, error, ms: 0, logs: [] };
      }
      return JSON.parse(text) as RunResult;
    },
  };
}
