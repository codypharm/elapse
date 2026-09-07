import { describe, it, expect } from "bun:test";
import { csvCell } from "../src/lib/csv";

// FR-API-113: a merchant-typed value never executes when the export opens in a spreadsheet.
describe("FR-API-113 CSV formula guard", () => {
  it("FR_API_113_formula_prefixes_are_neutralised_and_quoting_still_applies", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe("\"'\rx\""); // CR is also a quoting trigger
    expect(csvCell('=HYPERLINK("x"),y')).toBe("\"'=HYPERLINK(\"\"x\"\"),y\"");
  });
  it("FR_API_113_ordinary_values_are_untouched_and_numbers_stay_numbers", () => {
    expect(csvCell("settlement")).toBe("settlement");
    expect(csvCell("0.33")).toBe("0.33");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(12)).toBe("12");
    expect(csvCell("a,b")).toBe('"a,b"');
    // a numeric column may carry a negative number without the guard
    expect(csvCell("-0.33", { numeric: true })).toBe("-0.33");
  });
});
