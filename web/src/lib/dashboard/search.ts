/**
 * Where a search hit opens (FR-DSH-005). One place, so the search box and any
 * future "open" affordance agree. A checkout session has no page of its own;
 * its subscription list is the nearest view.
 */
import type { SearchHit, SearchHitType } from "./types";

export const SEARCH_TYPE_WORD: Record<SearchHitType, string> = {
  product: "Product",
  customer: "Customer",
  subscription: "Subscription",
  event: "Event",
  endpoint: "Endpoint",
  checkout_session: "Checkout session",
};

export function searchHitHref(hit: Pick<SearchHit, "type" | "id">): string {
  const id = encodeURIComponent(hit.id);
  switch (hit.type) {
    case "product": return `/dashboard/products?highlight=${id}`;
    case "customer": return `/dashboard/customers/${id}`;
    case "subscription": return `/dashboard/subscriptions/${id}`;
    case "event": return `/dashboard/developers/events/${id}`;
    case "endpoint": return `/dashboard/developers/webhooks/${id}`;
    case "checkout_session": return "/dashboard/subscriptions";
  }
}
