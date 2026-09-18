import type {
  Candidate,
  IRoutingStrategy,
  RoutingContext,
  UnifiedRequest,
} from "@free-ai-gateway/core";

/**
 * Orders candidates by an explicit, operator-configured provider priority list
 * (LLM_PROVIDER_PRIORITY, comma-separated provider ids, left = tried first)
 * instead of a health/latency heuristic. Providers not named in the list are
 * kept as extra fallback candidates, appended after the prioritized ones in
 * their original relative order, so an unlisted-but-configured provider still
 * gets a chance rather than being silently excluded.
 *
 * The actual failover/quota/circuit-breaker logic still lives in
 * CapabilityRouter.route() — this strategy only decides *order*.
 */
export class PriorityOrderStrategy implements IRoutingStrategy {
  private readonly priorityIndex: Map<string, number>;

  constructor(priorityOrder: string[]) {
    this.priorityIndex = new Map(priorityOrder.map((id, i) => [id, i]));
  }

  public rank(candidates: Candidate[], _request: UnifiedRequest, _context: RoutingContext): Candidate[] {
    const rank = (c: Candidate) => this.priorityIndex.get(c.adapter.config.id) ?? Number.MAX_SAFE_INTEGER;
    // Stable sort: candidates tied on rank (both unlisted, or same provider's
    // multiple models) keep the order the registry produced them in.
    return [...candidates]
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
      .map(({ c }) => c);
  }
}

/** Parses the LLM_PROVIDER_PRIORITY env var into an ordered provider id list. */
export function parseProviderPriority(envValue: string | undefined): string[] {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
