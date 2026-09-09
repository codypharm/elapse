/**
 * `usePagedList` — cursor paging for a dashboard list (FR-DSH-126). Page one
 * is read through `usePoll`, so it refreshes every 10 s like every other list
 * (FR-DSH-007). `more()` fetches the next page with the last row's id as the
 * cursor and appends it. A poll replaces page one and keeps the loaded pages,
 * merged by id, so nothing the merchant scrolled past disappears or jumps.
 * A new `fetchPage` identity (a filter or mode change) resets to page one.
 *
 * `fetchPage(startingAfter?)` is the API's own shape: `{ data, hasMore }`,
 * newest first (FR-API-080).
 */
"use client";

import { useCallback, useState } from "react";
import { usePoll } from "./use-poll";

export type Page<T> = { data: T[]; hasMore: boolean };
export type FetchPage<T> = (startingAfter?: string) => Promise<Page<T>>;

export type PagedList<T> = {
  /** Every loaded row, page one first, no duplicates. */
  rows: T[];
  /** True while the server has rows beyond the last loaded page. */
  hasMore: boolean;
  loading: boolean;
  stale: boolean;
  /** Loading the next page. */
  loadingMore: boolean;
  more: () => Promise<void>;
  reload: () => Promise<void>;
};

export function usePagedList<T extends { id: string }>(fetchPage: FetchPage<T>, { intervalMs = 10_000 }: { intervalMs?: number } = {}): PagedList<T> {
  const first = useCallback(() => fetchPage(undefined), [fetchPage]);
  const { data: page1, loading, stale, reload } = usePoll(first, { intervalMs });

  // Extra pages are remembered with the fetcher that produced them, so a new
  // fetcher reads as "no extra pages" without a setState in an effect. `carry`
  // is page one as it was when Load more was pressed: a row that a newer row
  // later pushes off page one would otherwise fall between the pages and vanish.
  const empty = { by: fetchPage, carry: [] as T[], pages: [] as Page<T>[], busy: false };
  const [extra, setExtra] = useState<{ by: FetchPage<T>; carry: T[]; pages: Page<T>[]; busy: boolean }>(empty);
  const mine = extra.by === fetchPage ? extra : empty;

  const rows = mergeById(page1?.data ?? [], mergeById(mine.carry, mine.pages.flatMap((p) => p.data)));
  const last = mine.pages[mine.pages.length - 1];
  const hasMore = last ? last.hasMore : (page1?.hasMore ?? false);

  const more = useCallback(async () => {
    const cursor = rows[rows.length - 1]?.id;
    if (!cursor || !hasMore || mine.busy) return;
    const carry = mergeById(mine.carry, page1?.data ?? []);
    setExtra({ by: fetchPage, carry, pages: mine.pages, busy: true });
    try {
      const page = await fetchPage(cursor);
      setExtra((s) => (s.by === fetchPage ? { ...s, pages: [...s.pages, page], busy: false } : s));
    } catch {
      setExtra((s) => (s.by === fetchPage ? { ...s, busy: false } : s));
    }
  }, [fetchPage, rows, hasMore, mine.busy, mine.pages, mine.carry, page1]);

  return { rows, hasMore, loading, stale, loadingMore: mine.busy, more, reload };
}

/** Page one wins; later rows are appended unless page one already has them. */
function mergeById<T extends { id: string }>(head: T[], tail: T[]): T[] {
  const seen = new Set(head.map((r) => r.id));
  const out = head.slice();
  for (const r of tail) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}
