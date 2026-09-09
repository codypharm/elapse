/**
 * `DashboardGate` — the client boundary every `/dashboard/*` route sits
 * behind. Loads the session; without one it redirects to `/login?next=`;
 * a merchant with no business name yet gets the first-run screen; then the
 * shell renders around the page.
 *
 * The session itself is an HttpOnly cookie the API sets (the mock stands it
 * in with localStorage). JavaScript never reads it; it only asks `me()`.
 *
 * While `me()` is in flight the real shell renders with `merchant: null`,
 * so a refresh shows the wordmark, the sections and the top bar at once and
 * only the page slot waits. The page slot carries the same title-and-table
 * shape every page resolves into, so nothing jumps when the answer lands.
 *
 * Maps to: FR-DSH-012, FR-DSH-013, FR-DSH-014.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboardApi } from "@/lib/dashboard/client";
import { DashboardApiError, type DashboardApi } from "@/lib/dashboard/mock-api";
import type { Merchant } from "@/lib/dashboard/types";
import { FirstRunForm } from "./first-run-form";
import { MerchantProvider } from "./merchant-context";
import { Page } from "./page-header";
import { DashboardShell } from "./shell";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "redirecting" }
  | { status: "ready"; merchant: Merchant };

export function DashboardGate({ api: injected, children }: { api?: DashboardApi; children: React.ReactNode }) {
  const api = injected ?? getDashboardApi();
  const router = useRouter();
  const pathname = usePathname();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((merchant) => alive && setLoad({ status: "ready", merchant }))
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof DashboardApiError && e.code === "unauthenticated") {
          setLoad({ status: "redirecting" });
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        } else {
          setLoad({ status: "error" });
        }
      });
    return () => {
      alive = false;
    };
  }, [api, router, pathname, reloadKey]);

  const setMerchant = useCallback((merchant: Merchant) => setLoad({ status: "ready", merchant }), []);

  const signOut = useCallback(async () => {
    await api.signOut();
    router.replace("/login");
  }, [api, router]);

  if (load.status === "loading" || load.status === "redirecting") {
    return (
      <DashboardShell merchant={null}>
        <PagePlaceholder />
      </DashboardShell>
    );
  }

  if (load.status === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-[15px]">We couldn&apos;t reach Elapse.</p>
        <p className="text-[13px] text-ink-soft">Nothing has changed. Try again in a moment.</p>
        <Button
          variant="outline"
          onClick={() => {
            setLoad({ status: "loading" });
            setReloadKey((k) => k + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const { merchant } = load;
  if (merchant.name === null) {
    return <FirstRunForm api={api} email={merchant.email} onDone={setMerchant} />;
  }

  return (
    <MerchantProvider value={{ merchant, api, setMerchant }}>
      <DashboardShell merchant={merchant} onSignOut={signOut}>
        {children}
      </DashboardShell>
    </MerchantProvider>
  );
}

/**
 * The page slot while the session loads: a title line, a lede, then a ruled
 * table of hairline rows, the shape every list page settles into. The text
 * is for screen readers; sighted users read the shape.
 */
function PagePlaceholder() {
  return (
    <Page>
      <span className="sr-only">Loading your dashboard</span>
      <Skeleton className="h-7 w-40" aria-hidden />
      <Skeleton className="mt-3 h-4 w-64 max-w-full" aria-hidden />
      <div className="mt-8 divide-y divide-border rounded-md border border-border" aria-hidden>
        <div className="flex h-10 items-center gap-6 px-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="ml-auto h-3 w-16" />
          <Skeleton className="hidden h-3 w-16 sm:block" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex h-16 items-center gap-6 px-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32 max-w-[60%]" />
              <Skeleton className="h-3 w-52 max-w-[80%]" />
            </div>
            <Skeleton className="h-4 w-14" />
            <Skeleton className="hidden h-4 w-14 sm:block" />
          </div>
        ))}
      </div>
    </Page>
  );
}
