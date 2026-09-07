/**
 * `FirstRunForm` — the one screen a brand-new merchant sees before the
 * dashboard: business name (required) and payout address (optional, can be
 * set later in Settings). Not a wizard.
 *
 * Maps to: FR-DSH-013.
 */
"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/site/logo";
import type { DashboardApi } from "@/lib/dashboard/mock-api";
import type { Merchant } from "@/lib/dashboard/types";
import { FieldHint } from "@/components/ui/field-hint";
import { fieldError } from "@/lib/forms/field-error";
import { check, rules } from "@/lib/forms/rules";

const FIELDS = { name: "Enter a business name.", payout_address: "An address is 0x followed by 40 hex characters." } as const;

export function FirstRunForm({
  api,
  email,
  onDone,
}: {
  api: DashboardApi;
  email: string;
  onDone: (m: Merchant) => void;
}) {
  const [name, setName] = useState("");
  const [payout, setPayout] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: keyof typeof FIELDS; message: string } | null>(null);
  // FR-DSH-114: the two rules the API enforces (name 1–80, address 0x + 40 hex), checked as typed.
  const problems = { name: check(rules.businessName, name), payout_address: check(rules.optional(rules.address), payout) };
  const valid = !problems.name && !problems.payout_address;
  const shown = (f: keyof typeof FIELDS, value: string) => (error?.field === f ? error.message : value.trim() ? problems[f] : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await api.completeFirstRun({ name: name.trim(), payoutAddress: payout.trim() || undefined }));
    } catch (err) {
      const f = fieldError(err, FIELDS);
      if (f) setError({ field: f.field as keyof typeof FIELDS, message: f.message });
      else setError({ message: err instanceof Error ? err.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto w-full max-w-[440px] px-5 pt-8">
        <Logo />
      </header>
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-5 py-10">
        <h1 className="display-wide text-balance text-[1.9rem] font-semibold leading-tight tracking-[-0.025em]">
          Name your business.
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          Signed in as <span className="numerals text-foreground">{email}</span>. Subscribers see this
          name on your checkout.
        </p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-name">Business name</Label>
            <Input
              id="business-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error?.field === "name") setError(null);
              }}
              autoComplete="organization"
              autoFocus
              maxLength={rules.businessName.maxLength}
              aria-invalid={shown("name", name) ? true : undefined}
              aria-describedby="business-name-hint"
              className="h-11 text-base"
            />
            <FieldHint id="business-name-hint" error={shown("name", name)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payout-address">
              Payout address <span className="font-normal text-ink-soft">(optional)</span>
            </Label>
            <Input
              id="payout-address"
              value={payout}
              onChange={(e) => {
                setPayout(e.target.value);
                if (error?.field === "payout_address") setError(null);
              }}
              placeholder="0x…"
              spellCheck={false}
              autoComplete="off"
              maxLength={rules.address.maxLength}
              pattern={rules.address.pattern}
              aria-invalid={shown("payout_address", payout) ? true : undefined}
              aria-describedby="payout-address-hint"
              className="numerals h-11 text-[15px]"
            />
            <FieldHint id="payout-address-hint" error={shown("payout_address", payout)} hint="This is where settled funds arrive. You can set it later in Settings." />
          </div>
          {error && !error.field && (
            <p role="alert" className="text-[13px] text-caution">
              {error.message}
            </p>
          )}
          <Button type="submit" size="lg" disabled={busy || !valid} className="mt-2 h-11 w-full text-[15px]">
            {busy ? "Saving…" : "Continue"}
            <ArrowRight data-icon="inline-end" className="size-4" />
          </Button>
        </form>
      </main>
    </div>
  );
}
