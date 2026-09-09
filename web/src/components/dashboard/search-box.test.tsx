/**
 * Top-bar search shows results as you type: debounce, five rows, keyboard
 * path, click, empty state, and the Enter fallback when no list is open.
 * FR-DSH-005 (ADR 2026-09-09).
 */
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "./search-box";
import { createMockDashboardApi, resetMockDashboardApi, type MockDashboardApi } from "@/lib/dashboard/mock-api";
import type { SearchHit } from "@/lib/dashboard/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

async function signIn(api: MockDashboardApi) {
  const { devToken } = await api.requestMagicLink("demo@elapse.finance");
  await api.verifyMagicLink(devToken);
}

describe("SearchBox · results as you type (FR-DSH-005)", () => {
  let api: MockDashboardApi;
  beforeEach(async () => {
    localStorage.clear();
    resetMockDashboardApi();
    api = createMockDashboardApi({ latencyMs: 0 });
    await signIn(api);
    push.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("asks once after two characters and a pause, and lists up to five rows with type, id, and detail", async () => {
    const search = vi.spyOn(api, "search");
    const user = userEvent.setup();
    render(<SearchBox api={api} />);
    const input = screen.getByRole("combobox", { name: /search/i });
    await user.type(input, "s");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(input, "ub_");
    await waitFor(() => expect(search).toHaveBeenCalled());
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenLastCalledWith("test", "sub_");
    const list = await screen.findByRole("listbox", { name: /results/i });
    const rows = within(list).getAllByRole("option");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows[0]).toHaveTextContent(/subscription/i);
    expect(rows[0]).toHaveTextContent(/sub_/);
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("arrow keys move the highlight; Enter opens the highlighted row and clears; Esc closes", async () => {
    const user = userEvent.setup();
    render(<SearchBox api={api} />);
    const input = screen.getByRole("combobox", { name: /search/i });
    await user.type(input, "cus_");
    const list = await screen.findByRole("listbox", { name: /results/i });
    const rows = within(list).getAllByRole("option");
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(input).toHaveAttribute("aria-activedescendant", rows[1]!.id);
    await user.keyboard("{ArrowUp}");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    const id = rows[0]!.textContent!.match(/cus_[A-Za-z0-9]+/)![0];
    expect(push).toHaveBeenCalledWith(`/dashboard/customers/${id}`);
    expect(input).toHaveValue("");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(input, "cus_");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input).toHaveValue("cus_");
  });

  it("clicking a row opens it; the row's page follows its type", async () => {
    const user = userEvent.setup();
    render(<SearchBox api={api} />);
    await user.type(screen.getByRole("combobox", { name: /search/i }), "evt_");
    const list = await screen.findByRole("listbox", { name: /results/i });
    const row = within(list).getAllByRole("option")[0]!;
    const id = within(row).getByText(/^evt_/).textContent!;
    await user.click(row);
    expect(push).toHaveBeenCalledWith(`/dashboard/developers/events/${id}`);
  });

  it("says no match inline for the current mode, without a toast, and never shows a secret", async () => {
    const user = userEvent.setup();
    render(<SearchBox api={api} />);
    await user.type(screen.getByRole("combobox", { name: /search/i }), "zzzz");
    expect(await screen.findByRole("status")).toHaveTextContent(/no match in test mode/i);
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.clear(screen.getByRole("combobox", { name: /search/i }));
    await user.type(screen.getByRole("combobox", { name: /search/i }), "whsec_");
    await waitFor(() => expect(screen.queryByRole("status") ?? screen.queryByRole("listbox")).not.toBeNull());
    expect(document.body.textContent).not.toMatch(/whsec_[A-Za-z0-9]{10}/);
  });

  it("Enter with no list open resolves a full id or an email the old way", async () => {
    const user = userEvent.setup();
    const [c] = (await api.listCustomers("test", { limit: 1 })).data;
    const search = vi.spyOn(api, "search").mockResolvedValue([] as SearchHit[]);
    render(<SearchBox api={api} />);
    const input = screen.getByRole("combobox", { name: /search/i });
    await user.type(input, c!.email!);
    await waitFor(() => expect(search).toHaveBeenCalled());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/dashboard/customers/${c!.id}`));
  });

  it("only the latest query's rows are shown when responses arrive out of order", async () => {
    const user = userEvent.setup();
    let release: (() => void) | null = null;
    const slow: SearchHit[] = [{ type: "product", id: "prod_stale", label: "Stale", detail: "$0.001 per second" }];
    const fast: SearchHit[] = [{ type: "product", id: "prod_fresh", label: "Fresh", detail: "$0.002 per second" }];
    vi.spyOn(api, "search").mockImplementationOnce(() => new Promise<SearchHit[]>((r) => { release = () => r(slow); })).mockImplementationOnce(async () => fast);
    render(<SearchBox api={api} />);
    const input = screen.getByRole("combobox", { name: /search/i });
    await user.type(input, "st");
    await waitFor(() => expect(release).not.toBeNull());
    await user.type(input, "a");
    await screen.findByText("Fresh");
    await act(async () => { release!(); });
    expect(screen.queryByText("Stale")).toBeNull();
    expect(screen.getByText("Fresh")).toBeInTheDocument();
  });
});
