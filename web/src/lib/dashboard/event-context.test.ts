import { describe, expect, it } from "vitest";
import { eventContextLine } from "./event-context";

/** FR-DSH-093: the one-line context under an event row. */
describe("eventContextLine (FR-DSH-093)", () => {
  it("product · email for a subscription event", () => {
    expect(eventContextLine({ context: { productName: "GPU hours", customer: "cus_1", customerEmail: "ann@example.com" } })).toBe("GPU hours · ann@example.com");
  });

  it("no email → the customer's short id from the context (so invoice events name them too)", () => {
    expect(eventContextLine({ context: { productName: "GPU hours", customer: "cus_2Lm8Nq4Rt7Vw1X", customerEmail: null } })).toBe("GPU hours · cus_…t7Vw1X");
  });

  it("invoice events append the amount the customer paid; the home feed can drop it", () => {
    const e = { context: { productName: "GPU hours", customer: "cus_1", customerEmail: "ann@example.com", amountSettled: "0.332" }, payload: {} };
    expect(eventContextLine(e)).toBe("GPU hours · ann@example.com · $0.332");
    expect(eventContextLine(e, { amount: false })).toBe("GPU hours · ann@example.com");
  });

  it("null or missing context → null, so the row falls back to the id", () => {
    expect(eventContextLine({ context: null })).toBeNull();
    expect(eventContextLine({})).toBeNull();
  });
});
