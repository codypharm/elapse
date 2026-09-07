/**
 * `BrandingSection` — what a merchant may brand on the hosted checkout:
 * display name, logo (PNG ≤ 50 KB, uploaded the moment it is picked and
 * previewed only once stored), accent colour, support URL; a live preview
 * renders the real `CheckoutFrame` at 390 px. Layout and copy of the
 * checkout are never editable here. Accent and URL follow the shared rules
 * and Save waits for them; a server rejection lands under its field.
 *
 * Maps to: FR-DSH-103, FR-DSH-114, FR-DSH-115; FR-CHK-014; FR-API-104.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckoutFrame } from "@/components/checkout/checkout-frame";
import { RatePanel } from "@/components/checkout/rate-panel";
import { contrastRatio, PAPER, parseHex } from "@/lib/dashboard/color";
import { newIdempotencyKey } from "@/lib/dashboard/idempotency";
import { FieldHint } from "@/components/ui/field-hint";
import { fieldError } from "@/lib/forms/field-error";
import { check, rules } from "@/lib/forms/rules";
import { useMerchant } from "./merchant-context";
import { Section } from "./settings-sections";

const MAX_LOGO_BYTES = 50 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const LOGO_MESSAGE = "Use a PNG under 50 KB.";
/** The signature bytes decide, the same test the server runs (FR-API-104); the name and declared type are ignored. */
async function isPng(file: File): Promise<boolean> {
  if (file.size === 0 || file.size > MAX_LOGO_BYTES) return false;
  const head = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  return PNG_SIGNATURE.every((b, i) => head[i] === b);
}
const BRANDING_FIELDS = { "branding.display_name": "Keep the name under 80 characters.", "branding.accent": "Use a colour like #1D4ED8.", "branding.support_url": "Enter a link starting with https://." } as const;
type BrandingField = keyof typeof BRANDING_FIELDS;

export function BrandingSection() {
  const { api, merchant, setMerchant } = useMerchant();
  const [name, setName] = useState(merchant.branding.name || merchant.name || "");
  const [accent, setAccent] = useState(merchant.branding.accent ?? "");
  const [supportUrl, setSupportUrl] = useState(merchant.branding.supportUrl ?? merchant.supportUrl ?? "");
  const [logoUrl, setLogoUrl] = useState<string | undefined>(merchant.branding.logoUrl);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The checkout renders in the subscriber's theme, so the accent must read
  // on both grounds; the weaker of the two decides.
  const ratio = accent ? Math.min(contrastRatio(accent, PAPER.dark) ?? 0, contrastRatio(accent, PAPER.light) ?? 0) : null;
  const lowContrast = accent.length > 0 && (ratio === null || ratio < 3);

  const [logoBusy, setLogoBusy] = useState(false);
  const [serverError, setServerError] = useState<{ field: BrandingField; message: string } | null>(null);
  // FR-DSH-114: the rules the API enforces, checked as the merchant types.
  const problems = {
    "branding.display_name": check({ ...rules.businessName, check: (v) => (v.length > 80 ? "Keep the name under 80 characters." : null) }, name),
    "branding.accent": check(rules.optional(rules.accent), accent),
    "branding.support_url": check(rules.optional(rules.url), supportUrl),
  };
  const valid = Object.values(problems).every((p) => p === null);
  const shown = (f: BrandingField, value: string) => (serverError?.field === f ? serverError.message : value.trim() ? problems[f] : null);

  // FR-DSH-103: the file is checked by its bytes and uploaded at once; the preview shows only what the server stored.
  const onLogo = async (file: File | undefined) => {
    setLogoError(null);
    if (!file || logoBusy) return;
    if (!(await isPng(file))) return setLogoError(LOGO_MESSAGE);
    setLogoBusy(true);
    try {
      const next = await api.uploadLogo(file, { idempotencyKey: newIdempotencyKey() });
      setMerchant(next);
      setLogoUrl(next.branding.logoUrl);
      toast.success("Logo saved");
    } catch (err) {
      setLogoError(fieldError(err, { logo: LOGO_MESSAGE })?.message ?? (err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setLogoBusy(false);
    }
  };
  const removeLogo = async () => {
    if (logoBusy) return;
    setLogoBusy(true);
    try {
      const next = await api.removeLogo({ idempotencyKey: newIdempotencyKey() });
      setMerchant(next);
      setLogoUrl(undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLogoBusy(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setServerError(null);
    try {
      setMerchant(
        await api.updateMerchant(
          { branding: { name: name.trim() || merchant.name || "", accent: accent.trim() || undefined, supportUrl: supportUrl.trim() || undefined, logoUrl } },
          { idempotencyKey: newIdempotencyKey() },
        ),
      );
      toast.success("Branding saved");
    } catch (err) {
      const f = fieldError(err, BRANDING_FIELDS);
      if (f) setServerError({ field: f.field as BrandingField, message: f.message });
      else toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // The native picker only speaks #rrggbb; feed it the current accent when
  // that parses, otherwise the default amber, and write picks back as hex.
  const pickerValue = (() => {
    const rgb = accent ? parseHex(accent) : null;
    return rgb ? `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}` : "#f5b74a";
  })();

  // Only a well-formed accent and URL reach the preview (they become a CSS value and an href).
  const preview = {
    name: name || "Your business",
    logoUrl,
    accent: lowContrast || problems["branding.accent"] ? undefined : accent || undefined,
    supportUrl: problems["branding.support_url"] ? undefined : supportUrl || undefined,
  };

  return (
    <Section title="Checkout branding" lede="Your name, logo and accent on the hosted checkout. Layout and copy are always ours.">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-name">Display name</Label>
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="organization" aria-invalid={shown("branding.display_name", name) ? true : undefined} aria-describedby="brand-name-hint" className="h-10" />
            <FieldHint id="brand-name-hint" error={shown("branding.display_name", name)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-logo">Logo</Label>
            <input
              id="brand-logo"
              type="file"
              accept="image/png"
              disabled={logoBusy}
              onChange={(e) => {
                void onLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
              aria-describedby="brand-logo-hint"
              className="text-[13px] text-ink-soft file:mr-3 file:h-9 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-[13px] file:font-medium file:text-foreground"
            />
            <FieldHint id="brand-logo-hint" error={logoError} hint={logoBusy ? "Uploading…" : "PNG up to 50 KB. Shown at 24 px beside your name. Saved as soon as you pick it."} />
            {logoUrl && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={removeLogo} disabled={logoBusy} className="h-9">
                  Remove logo
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-accent">Accent colour</Label>
            <div className="flex items-center gap-2">
              <label
                className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-border transition-colors hover:border-foreground/40 focus-within:ring-3 focus-within:ring-ring/50"
                style={{ background: accent && !lowContrast ? accent : "var(--live)" }}
                title="Pick a colour"
              >
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={pickerValue}
                  onInput={(e) => setAccent((e.target as HTMLInputElement).value)}
                  onChange={(e) => setAccent(e.target.value)}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                />
              </label>
              <Input id="brand-accent" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#f5b74a" spellCheck={false} maxLength={rules.accent.maxLength} pattern={rules.accent.pattern} autoComplete="off" aria-invalid={shown("branding.accent", accent) ? true : undefined} aria-describedby="brand-accent-hint" className="numerals h-10 max-w-[10rem] text-[13px]" />
            </div>
            <FieldHint
              id="brand-accent-hint"
              error={shown("branding.accent", accent)}
              hint={lowContrast ? <span className="text-caution">Hard to see against a light or dark page. Pick something with more contrast; the default amber is used until then.</span> : "Click the swatch to pick, or type a hex. The preview follows as you go. Leave empty for the default amber."}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="brand-support">Support URL</Label>
            <Input id="brand-support" type="url" inputMode="url" autoComplete="url" value={supportUrl} onChange={(e) => setSupportUrl(e.target.value)} maxLength={rules.url.maxLength} aria-invalid={shown("branding.support_url", supportUrl) ? true : undefined} aria-describedby="brand-support-hint" className="numerals h-10 text-[14px]" />
            <FieldHint id="brand-support-hint" error={shown("branding.support_url", supportUrl)} hint="Where subscribers go for help. Starts with https://." />
          </div>
          <div>
            <Button type="submit" disabled={busy || !valid} className="h-9">
              {busy ? "Saving…" : "Save branding"}
            </Button>
          </div>
        </form>
        <div className="lg:w-[390px]">
          <p className="placard">Preview · 390 px</p>
          <div data-testid="checkout-preview" className="mt-2 overflow-hidden rounded-lg border border-border">
            <div className="pointer-events-none origin-top-left [zoom:0.85] lg:[zoom:1]">
              <CheckoutFrame merchant={preview} className="min-h-[520px]">
                <RatePanel product={{ id: "prod_preview", name: "GPU · 4090", rateUsdPerSecond: "0.004", allowPause: false, status: "active" }} />
                <div className="mt-auto pt-6">
                  <Button size="lg" className="h-12 w-full text-base" tabIndex={-1}>
                    Continue
                  </Button>
                </div>
              </CheckoutFrame>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
