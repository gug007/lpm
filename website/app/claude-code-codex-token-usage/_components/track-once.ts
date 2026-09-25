import { trackTokenUsageDemo, type TokenUsageDemoAction } from "@/lib/analytics";

const sent = new Set<TokenUsageDemoAction>();

export function trackOnce(action: TokenUsageDemoAction) {
  if (sent.has(action)) return;
  sent.add(action);
  trackTokenUsageDemo(action);
}
