/**
 * The three key dialogs: create (name, 1–100 characters), roll (grace
 * period), revoke (confirm naming the key; a live key must have its name
 * typed back, FR-DSH-117). Each returns the merchant's intent; the page does
 * the API call with an idempotency key.
 *
 * Maps to: FR-DSH-071, FR-DSH-072, FR-DSH-073, FR-DSH-114, FR-DSH-117; BR-DSH-010.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApiKey } from "@/lib/dashboard/types";
import { GRACE_OPTIONS, GraceRadios } from "./grace-radios";
import { FieldHint } from "@/components/ui/field-hint";
import { check, rules } from "@/lib/forms/rules";

export function CreateKeyDialog({ open, onCancel, onCreate, busy }: { open: boolean; onCancel: () => void; onCreate: (name: string) => void; busy: boolean }) {
  const [name, setName] = useState("");
  const problem = check(rules.keyName, name);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) onCreate(name.trim());
          }}
          className="contents"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Create secret key</DialogTitle>
            <DialogDescription>Name it after where it lives. The key is shown once.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Production server" autoFocus maxLength={rules.keyName.maxLength} autoComplete="off" aria-describedby="key-name-hint" className="h-10" />
            <FieldHint id="key-name-hint" error={name.trim() ? problem : null} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} className="h-9">
              Cancel
            </Button>
            <Button type="submit" disabled={busy || problem !== null} className="h-9">
              {busy ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RollKeyDialog({ target, onCancel, onRoll, busy }: { target: ApiKey | null; onCancel: () => void; onRoll: (graceMs: number) => void; busy: boolean }) {
  const [grace, setGrace] = useState<number>(GRACE_OPTIONS[2].ms);
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Roll “{target?.name}”</DialogTitle>
          <DialogDescription>
            You get a new key with the same name. Choose when the old one, <span className="numerals">{target?.prefix}…{target?.last4}</span>, stops working.
          </DialogDescription>
        </DialogHeader>
        <GraceRadios value={grace} onChange={setGrace} />
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} className="h-9">
            Cancel
          </Button>
          <Button onClick={() => onRoll(grace)} disabled={busy} className="h-9">
            {busy ? "Rolling…" : "Roll key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeKeyDialog({ target, onCancel, onRevoke, busy }: { target: ApiKey | null; onCancel: () => void; onRevoke: () => void; busy: boolean }) {
  // FR-DSH-117: a live key is a production credential, so its name is typed back; a test key is one confirm.
  const [typed, setTyped] = useState("");
  const needsName = target?.livemode === true;
  const ready = !busy && (!needsName || typed.trim() === target?.name);
  const close = () => {
    setTyped("");
    onCancel();
  };
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) onRevoke();
          }}
          className="contents"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>Revoke “{target?.name}”?</DialogTitle>
            <DialogDescription>
              Requests signed with <span className="numerals">{target?.prefix}…{target?.last4}</span> fail from now on. The row stays in this list for your records.
            </DialogDescription>
          </DialogHeader>
          {needsName && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="revoke-confirm">Type the key&apos;s name to confirm</Label>
              <Input id="revoke-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={target?.name} autoFocus maxLength={rules.keyName.maxLength} autoComplete="off" className="h-10" />
              <p className="text-[13px] text-ink-soft">This is a live key. Anything still using it stops working the moment you revoke.</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} className="h-9">
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!ready} className="h-9">
              {busy ? "Revoking…" : "Revoke key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
