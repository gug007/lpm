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
      <h2 className="text-sm font-semibold">Breakdown</h2>
      <div className="flex flex-1 items-center pt-4">
        <ProviderDonut providers={providers} total={totals.totalTokens} />
      </div>
      <div className="pt-4">
        <div className="border-t border-[var(--border)] pt-4">
          <div className="mb-2.5 text-[12px] font-medium text-[var(--text-secondary)]">Token composition</div>
          <CompositionBar totals={totals} />
        </div>
      </div>
    </div>
  );
}
