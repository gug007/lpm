import type { TokenUsage, UsageBreakdown } from "../../types";
import { ProviderDonut } from "./ProviderDonut";
import { CompositionBar } from "./CompositionBar";

interface BreakdownPanelProps {
  providers: UsageBreakdown[];
  totals: TokenUsage;
}

export function BreakdownPanel({ providers, totals }: BreakdownPanelProps) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      <h2 className="text-sm font-medium">Breakdown</h2>
      <div className="mt-4">
        <ProviderDonut providers={providers} total={totals.totalTokens} />
      </div>
      <div className="my-4 border-t border-[var(--border)]" />
      <div>
        <div className="mb-2.5 text-[11px] font-medium text-[var(--text-muted)]">Token composition</div>
        <CompositionBar totals={totals} />
      </div>
    </div>
  );
}
