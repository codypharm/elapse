/**
 * Transactional mail bodies (FR-API-100). Email clients strip stylesheets, ignore flexbox and
 * refuse SVG, so the layout is a table with inline styles and the logo is the web app's hosted PNG
 * mark. (Inline `cid:` attachments were tried: Resend sends multipart/mixed and Gmail lists them as
 * files. Remote images load once the sender domain is verified; a shared resend.dev sender is not.)
 * Colours are DESIGN.md's paper / ink / ink-soft; the button is `button-primary` (ink on paper).
 * Every mail ships a text part with the same content for clients that show no HTML.
 */

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

const PAPER = "#fafafa";
const CARD = "#ffffff";
const INK = "#171717";
const INK_SOFT = "#666666";
const HAIRLINE = "#e5e5e5";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The sign-in mail: logo, one line of intent, a button, the raw link, the expiry. */
export function magicLinkMail(o: { link: string; logoUrl: string }): Mail {
  const link = escapeHtml(o.link);
  const logo = escapeHtml(o.logoUrl);
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sign in to Elapse</title></head>
<body style="margin:0;padding:0;background:${PAPER};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${CARD};border:1px solid ${HAIRLINE};border-radius:12px;">
<tr><td style="padding:28px 28px 0 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="vertical-align:middle;padding-right:10px;"><img src="${logo}" width="28" height="28" alt="" style="display:block;border:0;width:28px;height:28px;"></td>
    <td style="vertical-align:middle;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:-0.01em;color:${INK};">Elapse</td>
  </tr></table>
</td></tr>
<tr><td style="padding:28px 28px 0 28px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.01em;color:${INK};">Sign in to your dashboard</td></tr>
<tr><td style="padding:10px 28px 0 28px;font-family:${FONT};font-size:15px;line-height:22px;color:${INK_SOFT};">Press the button to sign in. No password needed.</td></tr>
<tr><td style="padding:24px 28px 0 28px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${INK};border-radius:8px;">
      <a href="${link}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${PAPER};text-decoration:none;border-radius:8px;">Sign in</a>
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 28px 0 28px;font-family:${FONT};font-size:13px;line-height:20px;color:${INK_SOFT};">If the button does not work, open this link:</td></tr>
<tr><td style="padding:6px 28px 0 28px;font-family:${MONO};font-size:12px;line-height:18px;word-break:break-all;"><a href="${link}" style="color:${INK};text-decoration:underline;">${link}</a></td></tr>
<tr><td style="padding:24px 28px 28px 28px;border-top:1px solid ${HAIRLINE};margin-top:24px;font-family:${FONT};font-size:13px;line-height:20px;color:${INK_SOFT};">This link works once and expires in 15 minutes. If you did not request it, ignore this email.</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;"><tr>
  <td style="padding:16px 28px 0 28px;font-family:${FONT};font-size:12px;line-height:18px;color:${INK_SOFT};">Elapse · You only pay what elapsed.</td>
</tr></table>
</td></tr>
</table>
</body>
</html>`;
  const text = `Sign in to your Elapse dashboard:\n\n${o.link}\n\nThis link works once and expires in 15 minutes. If you did not request it, ignore this email.`;
  return { subject: "Sign in to Elapse", text, html };
}
