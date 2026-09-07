/**
 * Settings sections: business profile, payout address, fee, notification
 * switches, danger zone. Each is a bounded form that talks to the API
 * with an idempotency key and reports through the merchant context.
 *
 * Maps to: FR-DSH-100, FR-DSH-101, FR-DSH-102, FR-DSH-104, FR-DSH-105; BR-DSH-010.
 */
"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/site/copy-button";
import { shortHex } from "@/lib/dashboard/format";
import { newIdempotencyKey } from "@/lib/dashboard/idempotency";
import { DashboardApiError } from "@/lib/dashboard/mock-api";
import { usePoll } from "@/lib/dashboard/use-poll";
import { useMerchant } from "./merchant-context";
import { FieldHint } from "@/components/ui/field-hint";
import { fieldError } from "@/lib/forms/field-error";
import { check, rules } from "@/lib/forms/rules";

export function Section({ title, lede, children }: { title: string; lede?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-border py-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
        {lede && <p className="mt-1 text-[13px] text-ink-soft">{lede}</p>}
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </section>
  );
}

/** Which `param` the API may name on a profile save, and the copy shown under that field (FR-DSH-115). */
const PROFILE_FIELDS = { name: "Keep the name between 1 and 80 characters.", support_email: "Enter a valid email address.", support_url: "Enter a link starting with https://." } as const;
type ProfileField = keyof typeof PROFILE_FIELDS;

export function ProfileSection() {
  const { api, merchant, setMerchant } = useMerchant();
  const [name, setName] = useState(merchant.name ?? "");
  const [supportEmail, setSupportEmail] = useState(merchant.supportEmail ?? "");
  const [supportUrl, setSupportUrl] = useState(merchant.supportUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<{ field: ProfileField; message: string } | null>(null);
  // FR-DSH-114: the rules the API enforces, checked as the merchant types; Save waits for all three.
  const problems = {
    name: check(rules.businessName, name),
    support_email: check(rules.optional(rules.email), supportEmail),
    support_url: check(rules.optional(rules.url), supportUrl),
  };
  const valid = !problems.name && !problems.support_email && !problems.support_url;
  const shown = (f: ProfileField, value: string) => (serverError?.field === f ? serverError.message : value.trim() ? problems[f] : f === "name" ? null : problems[f]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setServerError(null);
    try {
      setMerchant(await api.updateMerchant({ name, supportEmail, supportUrl }, { idempotencyKey: newIdempotencyKey() }));
      toast.success("Profile saved");
    } catch (err) {
      const f = fieldError(err, PROFILE_FIELDS);
      if (f) setServerError({ field: f.field as ProfileField, message: f.message });
      else toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  const field = (f: ProfileField) => ({
    "aria-invalid": shown(f, f === "name" ? name : f === "support_email" ? supportEmail : supportUrl) ? (true as const) : undefined,
    "aria-describedby": `biz-${f}-hint`,
    onChange: () => serverError?.field === f && setServerError(null),
  });
  return (
    <Section title="Business profile" lede="What subscribers and your team see.">
      <form onSubmit={save} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="biz-name">Business name</Label>
          <Input
            id="biz-name"
            value={name}
            maxLength={rules.businessName.maxLength}
            autoComplete="organization"
            {...field("name")}
            onChange={(e) => {
              setName(e.target.value);
              if (serverError?.field === "name") setServerError(null);
            }}
            className="h-10"
          />
          <FieldHint id="biz-name-hint" error={shown("name", name)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="biz-support-email">
            Support email <span className="font-normal text-ink-soft">(optional)</span>
          </Label>
          <Input
            id="biz-support-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={supportEmail}
            maxLength={rules.email.maxLength}
            {...field("support_email")}
            onChange={(e) => {
              setSupportEmail(e.target.value);
              if (serverError?.field === "support_email") setServerError(null);
            }}
            className="numerals h-10 text-[14px]"
          />
          <FieldHint id="biz-support_email-hint" error={shown("support_email", supportEmail)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="biz-support-url">
            Support URL <span className="font-normal text-ink-soft">(optional)</span>
          </Label>
          <Input
            id="biz-support-url"
            type="url"
            inputMode="url"
            autoComplete="url"
            value={supportUrl}
            maxLength={rules.url.maxLength}
            {...field("support_url")}
            onChange={(e) => {
              setSupportUrl(e.target.value);
              if (serverError?.field === "support_url") setServerError(null);
            }}
            className="numerals h-10 text-[14px]"
          />
          <FieldHint id="biz-support_url-hint" error={shown("support_url", supportUrl)} hint="Where subscribers go for help. Starts with https://." />
        </div>
        <div>
          <Button type="submit" disabled={busy || !valid} className="h-9">
            {busy ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

export function PayoutSection() {
  const { api, merchant, setMerchant } = useMerchant();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Live validation: the button wakes only when the address is well-formed and typed twice the same (FR-DSH-101).
  // FR-DSH-114: the same address rule every form uses.
  const addressProblem = check(rules.address, address);
  const wellFormed = addressProblem === null;
  const formHint = address && !wellFormed ? addressProblem : null;
  const matchHint = confirm && confirm !== address ? "The two addresses don't match." : null;
  const ready = wellFormed && confirm === address && !busy;
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    try {
      setMerchant(await api.changePayoutAddress({ address, confirm }, { idempotencyKey: newIdempotencyKey() }));
      setOpen(false);
      setAddress("");
      setConfirm("");
      toast.success("Payout address changed. It applies from the next settlement.");
    } catch (err) {
      setError(err instanceof DashboardApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Payout" lede="Settled funds arrive here automatically. Elapse never holds your balance.">
      <div className="flex flex-col gap-3">
        {merchant.payoutAddress ? (
          <p className="numerals flex items-center gap-1 text-[14px]">
            {shortHex(merchant.payoutAddress)}
            <CopyButton text={merchant.payoutAddress} label="Copy payout address" className="size-7" />
          </p>
        ) : (
          <p className="text-[14px] text-ink-soft">No payout address yet. Settlements wait until you set one.</p>
        )}
        <div>
          <Button variant="outline" onClick={() => setOpen(true)} className="h-9">
            {merchant.payoutAddress ? "Change payout address" : "Set payout address"}
          </Button>
        </div>
        <p className="text-[13px] text-ink-soft">
          Platform fee: {merchant.feeBps / 100} % of every settlement.{" "}
          <a href="mailto:hello@elapse.finance?subject=Volume%20pricing" className="text-foreground underline-offset-4 hover:underline">
            Contact us for volume pricing
          </a>
          .
        </p>
      </div>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <form onSubmit={change} className="contents" noValidate>
            <DialogHeader>
              <DialogTitle>{merchant.payoutAddress ? "Change payout address" : "Set payout address"}</DialogTitle>
              <DialogDescription>Every future settlement pays here. Type it twice; a typo would send your revenue to a stranger.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payout-new">New address</Label>
              <Input id="payout-new" value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="0x…" spellCheck={false} autoFocus maxLength={rules.address.maxLength} pattern={rules.address.pattern} autoComplete="off" aria-invalid={formHint ? true : undefined} aria-describedby={formHint ? "payout-new-hint" : undefined} className="numerals h-10 text-[13px]" />
              {formHint && (
                <p id="payout-new-hint" className="text-[13px] text-ink-soft">
                  {formHint}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="payout-confirm">Type it again</Label>
              <Input id="payout-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value.trim())} placeholder="0x…" spellCheck={false} maxLength={rules.address.maxLength} pattern={rules.address.pattern} autoComplete="off" aria-invalid={error || matchHint ? true : undefined} aria-describedby={matchHint ? "payout-confirm-hint" : undefined} className="numerals h-10 text-[13px]" />
              {matchHint && !error && (
                <p id="payout-confirm-hint" className="text-[13px] text-ink-soft">
                  {matchHint}
                </p>
              )}
              {error && (
                <p role="alert" className="text-[13px] text-caution">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9">
                Cancel
              </Button>
              <Button type="submit" disabled={!ready} className="h-9">
                {busy ? "Changing…" : "Change address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

export function NotificationsSection() {
  const { api } = useMerchant();
  const fetcher = useCallback(() => api.getNotificationSettings(), [api]);
  const { data, reload } = usePoll(fetcher, { intervalMs: 60_000 });
  const [saving, setSaving] = useState(false);
  // One write at a time: a second flick while the first is in flight would race it (FR-DSH-114).
  const set = async (patch: Partial<{ emailOnExhausted: boolean; emailOnExpiring: boolean }>) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.updateNotificationSettings(patch, { idempotencyKey: newIdempotencyKey() });
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Section title="Notifications" lede="Emails go to your account address. The bell in the top bar always shows everything.">
      <div className="divide-y divide-border rounded-lg border border-border">
        <label className="flex items-start justify-between gap-4 px-4 py-3">
          <span>
            <span className="block text-[14px] font-medium">Webhook endpoint stopped retrying</span>
            <span className="block text-[12px] text-ink-soft">After the 8th failed attempt on any delivery.</span>
          </span>
          <Switch aria-label="Email when a webhook endpoint stopped retrying" checked={data?.emailOnExhausted ?? true} onCheckedChange={(v) => set({ emailOnExhausted: v })} disabled={!data || saving} />
        </label>
        <label className="flex items-start justify-between gap-4 px-4 py-3">
          <span>
            <span className="block text-[14px] font-medium">API key or signing secret about to expire</span>
            <span className="block text-[12px] text-ink-soft">24 hours and 1 hour before a rolled key or secret stops working.</span>
          </span>
          <Switch aria-label="Email when an API key or signing secret is about to expire" checked={data?.emailOnExpiring ?? true} onCheckedChange={(v) => set({ emailOnExpiring: v })} disabled={!data || saving} />
        </label>
      </div>
    </Section>
  );
}

export function DangerSection() {
  const { api, merchant } = useMerchant();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const name = merchant.name ?? "";
  const del = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.deleteTestData({ confirmName: typed.trim() }, { idempotencyKey: newIdempotencyKey() });
      setOpen(false);
      setTyped("");
      toast.success("Test data deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="Danger zone" lede="Irreversible. Live data is never touched here.">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <span className="block text-[14px] font-medium">Delete test data</span>
            <span className="block text-[12px] text-ink-soft">Products, meters, keys, endpoints, events and the ledger in test mode.</span>
          </span>
          <Button variant="destructive" onClick={() => setOpen(true)} className="h-9 shrink-0">
            Delete test data
          </Button>
        </div>
        <p className="text-[13px] text-ink-soft">
          To close your account,{" "}
          <a href="mailto:hello@elapse.finance?subject=Close%20my%20account" className="text-foreground underline-offset-4 hover:underline">
            email us
          </a>
          . We confirm within one business day.
        </p>
      </div>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all test data?</DialogTitle>
            <DialogDescription>Every test-mode object goes away, including keys your integration may be using. Live mode is untouched.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="danger-confirm">Type {name} to confirm</Label>
            <Input id="danger-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus maxLength={rules.businessName.maxLength} autoComplete="off" className="h-10" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="h-9">
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy || typed.trim() !== name} onClick={del} className="h-9">
              {busy ? "Deleting…" : "Delete everything in test mode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}
