/**
 * `LoadMore` — the control under a cursor-paged list (FR-DSH-126): "Load more"
 * appends the next page in place; beside it the rows shown and "more
 * available" while the server has more. Renders nothing on the last page.
 * Maps to: design brief, dashboard lists; FR-DSH-126.
 */
"use client";

import { Button } from "@/components/ui/button";

export function LoadMore({ shown, hasMore, loading, onMore }: { shown: number; hasMore: boolean; loading: boolean; onMore: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="mt-3 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
      <Button variant="outline" onClick={onMore} disabled={loading} className="h-11 min-w-32 sm:h-9">
        {loading ? "Loading…" : "Load more"}
      </Button>
      <span className="numerals text-[13px] text-ink-soft">{shown} shown · more available</span>
    </div>
  );
}
