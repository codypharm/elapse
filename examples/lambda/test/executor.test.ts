import { describe, expect, it } from "vitest";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { awsRunner, mockRunner } from "../src/executor";

describe("FR-EXM-121 mockRunner", () => {
  it("returns a deterministic tile without touching the network", async () => {
    const input = { width: 32, height: 24, iterations: 50 };
    const r1 = await mockRunner().run(input);
    const r2 = await mockRunner().run(input);
    expect(r1.ok).toBe(true);
    expect(r1).toEqual(r2);
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.result.width).toBe(32);
    expect(r1.result.height).toBe(24);
    expect(r1.result.png).toMatch(/^data:image\/png;base64,/);
  });
});

describe("FR-EXM-121 awsRunner", () => {
  it("invokes the named function with the request and returns the tile", async () => {
    let seen: InvokeCommand["input"] | undefined;
    const client = {
      async send(command: InvokeCommand) {
        seen = command.input;
        const body = { ok: true, result: { png: "data:image/png;base64,AAA", width: 32, height: 24, iterations: 50 }, ms: 9, logs: [] };
        return { StatusCode: 200, Payload: new TextEncoder().encode(JSON.stringify(body)) };
      },
    };
    const r = await awsRunner({ client, fnName: "elapse-lambda-runner" }).run({ width: 32, height: 24, iterations: 50 });

    expect(seen?.FunctionName).toBe("elapse-lambda-runner");
    expect(JSON.parse(new TextDecoder().decode(seen!.Payload as Uint8Array))).toEqual({ width: 32, height: 24, iterations: 50 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.result.width).toBe(32);
  });
});

describe("FR-EXM-123 awsRunner errors", () => {
  it("maps a Lambda timeout to a readable error", async () => {
    const client = {
      async send() {
        const errBody = { errorType: "Unhandled", errorMessage: "2026-09-12T00:00:00Z Task timed out after 5.00 seconds" };
        return { StatusCode: 200, FunctionError: "Unhandled", Payload: new TextEncoder().encode(JSON.stringify(errBody)) };
      },
    };
    const r = await awsRunner({ client, fnName: "fn" }).run({ width: 8, height: 8, iterations: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("execution timed out");
  });

  it("maps a thrown SDK error to a readable message, never a raw stack", async () => {
    const client = {
      async send(): Promise<never> {
        throw Object.assign(new Error("Rate exceeded"), { name: "TooManyRequestsException" });
      },
    };
    const r = await awsRunner({ client, fnName: "fn" }).run({ width: 8, height: 8, iterations: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/rate|too many|busy/i);
      expect(r.error).not.toMatch(/\bat \//); // no stack frames
    }
  });
});
