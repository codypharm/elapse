import { describe, it, expect, beforeEach } from "bun:test";
import { api, resetDb, seedMerchant } from "./helpers";
import { createSession } from "../src/db/sessions";
import { app } from "../src/app";

const ORIGIN = "http://localhost:3000";
const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** A tiny valid PNG signature followed by filler: the server checks the signature bytes, not the file name. */
const png = (size = 64) => {
  const b = new Uint8Array(size);
  b.set(PNG_SIG);
  return b;
};

async function signIn() {
  const m = await seedMerchant();
  const s = await createSession(m.merchantId, null);
  return { cookie: `elapse_session=${s.token}`, merchantId: m.merchantId };
}
async function upload(cookie: string, bytes: Uint8Array, name = "logo.png", type = "image/png") {
  const fd = new FormData();
  fd.set("logo", new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
  const res = await app.request("/v1/dashboard/branding/logo", { method: "POST", headers: { cookie, origin: ORIGIN, "x-elapse-mode": "test" }, body: fd });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeEach(async () => {
  await resetDb();
});

describe("FR-API-104 logo upload", () => {
  it("FR_API_104_a_png_under_50_KB_is_stored_and_served_publicly_as_image_png_with_a_hashed_url", async () => {
    const { cookie, merchantId } = await signIn();
    const r = await upload(cookie, png(1000));
    expect(r.status).toBe(200);
    const url: string = r.body.branding.logo_url;
    expect(url).toMatch(new RegExp(`/v1/dashboard/branding/logo/${merchantId}\\?v=[0-9a-f]{16}$`));
    const path = url.slice(url.indexOf("/v1/"));
    const img = await app.request(path); // no cookie: public, like any checkout asset
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png(1000));
    // the profile and the public checkout branding carry the same URL
    const me = await api("GET", "/v1/dashboard/me", { headers: { cookie, origin: ORIGIN } });
    expect(me.body.branding.logo_url).toBe(url);
    // replacing the logo changes the URL, so a cached old image is never shown
    const r2 = await upload(cookie, png(2000));
    expect(r2.body.branding.logo_url).not.toBe(url);
  });

  it("FR_API_104_anything_but_a_real_png_or_over_50_KB_is_400_on_param_logo", async () => {
    const { cookie } = await signIn();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>');
    for (const [bytes, name, type] of [
      [svg, "logo.svg", "image/svg+xml"],
      [svg, "logo.png", "image/png"], // renamed: the signature decides
      [png(50 * 1024 + 1), "big.png", "image/png"],
      [new Uint8Array([0xff, 0xd8, 0xff]), "photo.jpg", "image/jpeg"],
    ] as const) {
      const r = await upload(cookie, bytes, name, type);
      expect(r.status).toBe(400);
      expect(r.body.error).toMatchObject({ type: "invalid_request_error", param: "logo", message: "Use a PNG under 50 KB." });
    }
    const missing = await app.request("/v1/dashboard/branding/logo", { method: "POST", headers: { cookie, origin: ORIGIN, "x-elapse-mode": "test" }, body: new FormData() });
    expect(missing.status).toBe(400);
  });

  it("FR_API_104_delete_clears_the_logo_and_the_old_url_becomes_404", async () => {
    const { cookie, merchantId } = await signIn();
    const url: string = (await upload(cookie, png())).body.branding.logo_url;
    const del = await api("DELETE", "/v1/dashboard/branding/logo", { headers: { cookie, origin: ORIGIN, "x-elapse-mode": "test" } });
    expect(del.status).toBe(200);
    expect(del.body.branding.logo_url).toBeNull();
    expect((await app.request(url.slice(url.indexOf("/v1/")))).status).toBe(404);
    expect((await app.request(`/v1/dashboard/branding/logo/${merchantId}`)).status).toBe(404);
  });

  it("FR_API_104_upload_needs_the_session_and_the_dashboard_origin", async () => {
    const { cookie } = await signIn();
    const fd = new FormData();
    fd.set("logo", new File([png() as Uint8Array<ArrayBuffer>], "logo.png", { type: "image/png" }));
    expect((await app.request("/v1/dashboard/branding/logo", { method: "POST", headers: { origin: ORIGIN }, body: fd })).status).toBe(401);
    expect((await app.request("/v1/dashboard/branding/logo", { method: "POST", headers: { cookie, origin: "https://evil.example" }, body: fd })).status).toBe(403);
  });
});
