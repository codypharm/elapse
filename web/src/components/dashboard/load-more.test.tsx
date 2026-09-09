/** `LoadMore` (FR-DSH-126): the button under a paged list, with the shown count beside it. */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoadMore } from "./load-more";

describe("LoadMore (FR-DSH-126)", () => {
  it("renders nothing once the last page is loaded", () => {
    const { container } = render(<LoadMore shown={120} hasMore={false} loading={false} onMore={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count, says more is available, and calls onMore", async () => {
    const onMore = vi.fn();
    render(<LoadMore shown={50} hasMore loading={false} onMore={onMore} />);
    expect(screen.getByText(/50 shown · more available/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("disables the button and says Loading while the next page is in flight", () => {
    render(<LoadMore shown={50} hasMore loading onMore={() => {}} />);
    const b = screen.getByRole("button", { name: /loading/i });
    expect(b).toBeDisabled();
  });
});
