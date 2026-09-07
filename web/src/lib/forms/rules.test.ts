import { describe, expect, it } from "vitest";
import { accepted, rules, check } from "./rules";

// FR-DSH-114: every rule the API enforces, mirrored once. Each case is a value the server
// would accept or reject, so the client refuses exactly what the server refuses.
describe("FR-DSH-114 shared field rules", () => {
  it("FR_DSH_114_business_name_is_1_to_80_characters_trimmed", () => {
    expect(check(rules.businessName, "  Acme  ")).toBeNull();
    expect(check(rules.businessName, "   ")).toBe("Enter a business name.");
    expect(check(rules.businessName, "x".repeat(81))).toBe("Keep it under 80 characters.");
    expect(rules.businessName.maxLength).toBe(80);
  });

  it("FR_DSH_114_rate_is_a_positive_decimal_with_at_most_6_places", () => {
    expect(check(rules.rate, "0.004")).toBeNull();
    expect(check(rules.rate, "12")).toBeNull();
    expect(check(rules.rate, "abc")).toBe("Enter a decimal like 0.004.");
    expect(check(rules.rate, "0")).toBe("The rate must be more than zero.");
    expect(check(rules.rate, "0.0000001")).toBe("Use at most 6 decimal places.");
    expect(check(rules.rate, "1e-3")).toBe("Enter a decimal like 0.004.");
  });

  it("FR_DSH_114_address_is_0x_and_40_hex_characters", () => {
    expect(check(rules.address, "0x" + "a".repeat(40))).toBeNull();
    expect(check(rules.address, "0x" + "a".repeat(39))).toBe("An address is 0x followed by 40 hex characters.");
    expect(check(rules.address, "")).toBe("Enter an address.");
    expect(rules.address.pattern).toBe("0x[0-9a-fA-F]{40}");
  });

  it("FR_DSH_114_email_needs_one_at_and_a_dot_after_it_within_254", () => {
    expect(check(rules.email, "a@b.co")).toBeNull();
    expect(check(rules.email, "a@b")).toBe("Enter a valid email address.");
    expect(check(rules.email, "a@@b.co")).toBe("Enter a valid email address.");
    expect(check(rules.email, "a".repeat(250) + "@b.co")).toBe("Enter a valid email address.");
  });

  it("FR_DSH_114_url_is_http_or_https_within_2048", () => {
    expect(check(rules.url, "https://acme.test/help")).toBeNull();
    expect(check(rules.url, "http://acme.test")).toBeNull();
    expect(check(rules.url, "javascript:alert(1)")).toBe("Enter a link starting with https://.");
    expect(check(rules.url, "acme.test")).toBe("Enter a link starting with https://.");
    expect(check(rules.url, "https://a.test/" + "x".repeat(2040))).toBe("Keep it under 2048 characters.");
  });

  it("FR_DSH_114_optional_rules_accept_empty", () => {
    expect(check(rules.optional(rules.url), "")).toBeNull();
    expect(check(rules.optional(rules.url), "nope")).toBe("Enter a link starting with https://.");
  });

  it("FR_DSH_114_accent_is_rrggbb", () => {
    expect(check(rules.accent, "#1D4ED8")).toBeNull();
    expect(check(rules.accent, "amber")).toBe("Use a colour like #1D4ED8.");
  });

  it("FR_DSH_114_key_product_and_description_lengths_match_the_api", () => {
    expect(rules.keyName.maxLength).toBe(100);
    expect(rules.productName.maxLength).toBe(200);
    expect(rules.description.maxLength).toBe(1000);
    expect(check(rules.description, "")).toBeNull();
    expect(check(rules.keyName, "")).toBe("Enter a name.");
  });

  it("FR_DSH_114_cap_minutes_are_whole_between_1_and_43200", () => {
    expect(check(rules.capMinutes, "1")).toBeNull();
    expect(check(rules.capMinutes, "43200")).toBeNull();
    expect(check(rules.capMinutes, "0")).toBe("Between 1 minute and 30 days.");
    expect(check(rules.capMinutes, "43201")).toBe("Between 1 minute and 30 days.");
    expect(check(rules.capMinutes, "1.5")).toBe("Enter whole minutes.");
  });

  it("FR_DSH_114_one_time_code_is_six_digits", () => {
    expect(check(rules.code, "123456")).toBeNull();
    expect(check(rules.code, "12345")).toBe("Enter the 6-digit code.");
    expect(check(rules.code, "12345a")).toBe("Enter the 6-digit code.");
  });
});

describe("accepted (keystroke filter)", () => {
  it("FR_DSH_114_numeric_fields_refuse_what_could_never_become_a_value", () => {
    expect(accepted(rules.rate, "", "a")).toBe("");
    expect(accepted(rules.rate, "0.", "0..")).toBe("0.");
    expect(accepted(rules.rate, "0.000000", "0.0000001")).toBe("0.000000");
    expect(accepted(rules.rate, "0.00", "0.004")).toBe("0.004");
    expect(accepted(rules.rate, "", "0..0-04x")).toBe("0.004"); // paste keeps the usable characters
    expect(accepted(rules.capMinutes, "3", "3a")).toBe("3");
    expect(accepted(rules.code, "12", "12 ")).toBe("12");
    expect(accepted(rules.productName, "GP", "GP U")).toBe("GP U"); // text rules accept anything
  });
});
