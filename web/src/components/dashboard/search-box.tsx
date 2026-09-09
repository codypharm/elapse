/**
 * `SearchBox` — the top-bar lookup with results as you type. After two
 * characters and a 200 ms pause it asks the API and lists up to five hits
 * under the input (type word, id or name, one line of context). Arrow keys
 * move, Enter opens the highlighted hit, Esc closes, click opens. Enter with
 * no list open resolves a full id or an email the old way. "No match in
 * test mode" is said inline. Scoped to the current mode.
 *
 * Maps to: FR-DSH-005 (ADR 2026-09-09 search as you type), FR-DSH-118.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { DashboardApi } from "@/lib/dashboard/mock-api";
import { useMode } from "@/lib/dashboard/mode";
import { SEARCH_TYPE_WORD, searchHitHref } from "@/lib/dashboard/search";
import type { SearchHit } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

type Results = { query: string; hits: SearchHit[] } | null;

export function SearchBox({ api, onNavigate, size = "sm", className }: { api: DashboardApi | null; onNavigate?: () => void; size?: "sm" | "lg"; className?: string }) {
  const router = useRouter();
  const mode = useMode();
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const trimmed = q.trim();
  const hits = results && results.query === trimmed ? results.hits : null;
  const showList = open && hits !== null && hits.length > 0;
  const noMatch = open && hits !== null && hits.length === 0 && trimmed.length >= MIN_CHARS;

  // FR-DSH-005: one request per pause in typing; a late answer for an older query is dropped.
  useEffect(() => {
    if (!api || trimmed.length < MIN_CHARS) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      let found: SearchHit[] = [];
      try {
        found = await api.search(mode, trimmed);
      } catch {
        found = [];
      }
      if (mine !== seq.current) return;
      setResults({ query: trimmed, hits: found });
      setOpen(true);
      setActive(-1);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, mode, trimmed]);

  const go = (href: string) => {
    router.push(href);
    setQ("");
    setResults(null);
    setOpen(false);
    setActive(-1);
    onNavigate?.();
  };

  /** Enter with no list open: a full id or an email, resolved as before (FR-DSH-005). */
  const resolve = async () => {
    if (!api || busy || !trimmed) return;
    setBusy(true);
    try {
      const href = await api.resolveSearch(mode, trimmed);
      if (href) go(href);
      else {
        setResults({ query: trimmed, hits: [] });
        setOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (showList && hits) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % hits.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? hits.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        go(searchHitHref(hits[active < 0 ? 0 : active]!));
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      void resolve();
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;
  const lg = size === "lg";

  return (
    <div className={cn("relative", className)}>
      <Search className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-soft", lg ? "left-3 size-4" : "left-2.5 size-3.5")} />
      <input
        role="combobox"
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          if (e.target.value.trim().length < MIN_CHARS) setOpen(false);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => hits && setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search ids or emails"
        aria-label="Search"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        aria-busy={busy || undefined}
        autoComplete="off"
        spellCheck={false}
        maxLength={254}
        disabled={!api}
        className={cn(
          "numerals w-full rounded-lg border border-input bg-transparent outline-none placeholder:font-sans placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30",
          lg ? "h-11 pr-3 pl-10 text-[15px]" : "h-8 w-56 pr-2.5 pl-8 text-[13px]",
        )}
      />
      {showList && hits && (
        <ol
          id={listId}
          role="listbox"
          aria-label="Search results"
          // Pointer down would blur the input and close the list before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "absolute top-full right-0 z-50 mt-1.5 max-h-80 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10",
            lg ? "left-0" : "w-[24rem] max-w-[calc(100vw-1rem)]",
          )}
        >
          {hits.map((h, i) => (
            <li
              key={`${h.type}:${h.id}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(searchHitHref(h))}
              className={cn(
                "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 rounded-md px-2.5 py-2 text-[13px]",
                i === active ? "bg-accent text-accent-foreground" : "",
              )}
            >
              <span className="numerals min-w-0 truncate text-foreground">{h.label}</span>
              <span className="placard whitespace-nowrap">{SEARCH_TYPE_WORD[h.type]}</span>
              <span className="numerals col-span-2 min-w-0 truncate text-[12px] text-ink-soft">
                {[h.label === h.id ? "" : h.id, h.detail].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ol>
      )}
      {noMatch && (
        <p
          role="status"
          className={cn("absolute top-full right-0 z-50 mt-1.5 rounded-lg bg-popover px-3 py-2 text-[12px] text-ink-soft shadow-md ring-1 ring-foreground/10", lg ? "left-0" : "w-56")}
        >
          No match in {mode} mode.
        </p>
      )}
    </div>
  );
}
