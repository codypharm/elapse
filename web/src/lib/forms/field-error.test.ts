import { describe, expect, it } from "vitest";
import { fieldError } from "./field-error";

// FR-DSH-115: a server rejection that names a `param` lands on that field with the form's own
// copy; anything else is left for the toast.
describe("FR-DSH-115 server param to field", () => {
  const fields = { name: "Enter a business name.", "branding.accent": "Use a colour like #1D4ED8.", support_url: "Enter a link starting with https://." };

  it("FR_DSH_115_a_param_the_form_knows_becomes_that_fields_message", () => {
    const err = Object.assign(new Error("Invalid branding.accent: must be a #rrggbb colour"), { param: "branding.accent", status: 400 });
    expect(fieldError(err, fields)).toEqual({ field: "branding.accent", message: "Use a colour like #1D4ED8." });
  });

  it("FR_DSH_115_a_param_the_form_does_not_know_or_no_param_is_null", () => {
    expect(fieldError(Object.assign(new Error("x"), { param: "events", status: 400 }), fields)).toBeNull();
    expect(fieldError(new Error("Something went wrong."), fields)).toBeNull();
    expect(fieldError("nope", fields)).toBeNull();
  });

  it("FR_DSH_115_a_field_may_map_to_a_function_of_the_api_message", () => {
    const err = Object.assign(new Error("Invalid url: must use https in live mode"), { param: "url", status: 400 });
    expect(fieldError(err, { url: (m) => (m.includes("https") ? "Live endpoints need https://." : "Enter a link.") })).toEqual({ field: "url", message: "Live endpoints need https://." });
  });
});
