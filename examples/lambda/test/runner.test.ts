import { describe, expect, it } from "vitest";

// The deployed Lambda is plain .mjs so it can be zipped and shipped as-is;
// runner/index.d.mts carries its contract for typechecking.
import { handler } from "../runner/index.mjs";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("FR-EXM-122 the runner renders a tile; it does not run code", () => {
  it("returns a real PNG for a known request", async () => {
    const r = await handler({ width: 32, height: 24, iterations: 50 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);

    expect(r.result.width).toBe(32);
    expect(r.result.height).toBe(24);
    expect(r.result.png).toMatch(/^data:image\/png;base64,/);
    const bytes = Buffer.from(r.result.png.split(",")[1] ?? "", "base64");
    expect([...bytes.subarray(0, 8)]).toEqual(PNG_MAGIC);
    expect(typeof r.ms).toBe("number");
  });

  it("clamps an over-large request rather than attempting it", async () => {
    const r = await handler({ width: 99999, height: 99999, iterations: 10_000_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);

    expect(r.result.width).toBeLessThanOrEqual(1024);
    expect(r.result.height).toBeLessThanOrEqual(1024);
    expect(r.result.iterations).toBeLessThanOrEqual(5000);
  });

  it("rejects a malformed request readably", async () => {
    const r = await handler({ width: "big", height: 10, iterations: 10 });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected a rejection");

    expect(r.error).toMatch(/width|number|invalid/i);
  });

  it("BR-EXM-108: a `code` field is ignored, never executed", async () => {
    const r = await handler({ code: "throw new Error('should never run')", width: 8, height: 8, iterations: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);

    expect(r.result.width).toBe(8);
  });
});
