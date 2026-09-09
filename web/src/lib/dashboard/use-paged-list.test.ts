/**
 * `usePagedList` — cursor paging for dashboard lists (FR-DSH-126): page one
 * polls like every list (FR-DSH-007), Load more appends the next page by
 * cursor, a poll refreshes page one and merges by id so loaded pages stay,
 * and a new fetcher identity (filter or mode change) resets to page one.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePagedList } from "./use-paged-list";

type Row = { id: string; n: number };
const rows = (from: number, count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: `r${from + i}`, n: from + i }));

/** A 120-row source, newest first, served in pages of 50 by cursor. */
function source(total = 120, size = 50) {
  const all = rows(1, total).reverse();
  const calls: (string | undefined)[] = [];
  const fetchPage = vi.fn(async (startingAfter?: string) => {
    calls.push(startingAfter);
    const start = startingAfter ? all.findIndex((r) => r.id === startingAfter) + 1 : 0;
    const data = all.slice(start, start + size);
    return { data, hasMore: start + size < all.length };
  });
  return { all, fetchPage, calls };
}

describe("usePagedList (FR-DSH-126)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the first page, appends the next by cursor, and hides Load more on the last page", async () => {
    const s = source();
    const { result } = renderHook(() => usePagedList(s.fetchPage));
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.rows[0]!.id).toBe("r120");

    await act(async () => {
      await result.current.more();
    });
    expect(result.current.rows).toHaveLength(100);
    expect(s.calls[1]).toBe("r71");
    await act(async () => {
      await result.current.more();
    });
    expect(result.current.rows).toHaveLength(120);
    expect(result.current.hasMore).toBe(false);
  });

  it("a poll refreshes page one and keeps the loaded pages, merging by id", async () => {
    const s = source();
    const { result } = renderHook(() => usePagedList(s.fetchPage, { intervalMs: 10_000 }));
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    await act(async () => {
      await result.current.more();
    });
    expect(result.current.rows).toHaveLength(100);
    // A new row lands at the top between polls.
    s.all.unshift({ id: "r121", n: 121 });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    await waitFor(() => expect(result.current.rows[0]!.id).toBe("r121"));
    expect(result.current.rows).toHaveLength(101);
    expect(new Set(result.current.rows.map((r) => r.id)).size).toBe(101);
    expect(result.current.hasMore).toBe(true);
  });

  it("a new fetcher identity resets to page one", async () => {
    const a = source();
    const b = source(30);
    const { result, rerender } = renderHook(({ f }) => usePagedList(f), { initialProps: { f: a.fetchPage } });
    await waitFor(() => expect(result.current.rows).toHaveLength(50));
    await act(async () => {
      await result.current.more();
    });
    expect(result.current.rows).toHaveLength(100);
    rerender({ f: b.fetchPage });
    await waitFor(() => expect(result.current.rows).toHaveLength(30));
    expect(result.current.hasMore).toBe(false);
  });
});
