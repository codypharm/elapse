import { describe, expect, it } from "vitest";
import record from "./deployments/10143.json";
import { feePercent, splitSettled, FEE_BPS } from "./fee";
import { formatUsd, parseRate, settledNano } from "./meter/math";

describe("FR-LND-018 fee from the deployment record", () => {
  it("FR_LND_018_the_fee_percent_is_the_records_feeBps_over_100", () => {
    expect(FEE_BPS).toBe(record.feeBps);
    expect(feePercent()).toBe(`${record.feeBps / 100} %`);
  });

  it("FR_LND_015_83_seconds_at_0_004_splits_into_merchant_and_fee_in_nano_dollars", () => {
    const paid = settledNano(parseRate("0.004"), 83);
    const { merchant, fee } = splitSettled(paid, 200);
    expect(formatUsd(paid, 3, { symbol: false })).toBe("0.332");
    expect(fee).toBe(6_640_000n); // $0.00664
    expect(merchant).toBe(325_360_000n); // $0.32536
    expect(merchant + fee).toBe(paid);
  });

  it("FR_LND_015_the_fee_floors_so_the_merchant_never_loses_a_rounding_unit", () => {
    const { merchant, fee } = splitSettled(3n, 200);
    expect(fee).toBe(0n);
    expect(merchant).toBe(3n);
  });
});
