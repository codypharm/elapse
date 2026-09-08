import { describe, expect, it } from "bun:test";
import { magicLinkMail } from "../src/lib/mail-templates";

/** FR-API-100: the magic link mail. Button, the raw link for clients that strip buttons, the logo, the expiry line. */
describe("magicLinkMail", () => {
  const link = "https://elapse.finance/login/verify?token=abc.def";
  const mail = magicLinkMail({ link, logoUrl: "https://elapse.finance/apple-icon.png" });

  it("FR_API_100_html_has_a_button_and_the_raw_link", () => {
    expect(mail.subject).toBe("Sign in to Elapse");
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain(">Sign in<");
    expect(mail.html).toContain(`>${link}<`);
  });

  it("FR_API_100_html_shows_the_logo_and_the_expiry", () => {
    expect(mail.html).toContain(`<img src="https://elapse.finance/apple-icon.png"`);
    expect(mail.html).toContain("15 minutes");
    expect(mail.html).toContain("If you did not request it");
  });

  it("FR_API_100_text_carries_the_link_and_the_expiry", () => {
    expect(mail.text).toContain(link);
    expect(mail.text).toContain("15 minutes");
    expect(mail.text).not.toContain("<");
  });

  it("FR_API_100_link_is_html_escaped", () => {
    const m = magicLinkMail({ link: "https://x.test/?a=1&b=2", logoUrl: "https://x.test/l.png" });
    expect(m.html).toContain("https://x.test/?a=1&amp;b=2");
    expect(m.text).toContain("https://x.test/?a=1&b=2");
  });
});
