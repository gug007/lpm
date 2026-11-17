import { BarChart3 } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { CARD_CLASS } from "../ui/fields";
import { providerMeta } from "./statsDerive";

export function StatsEmpty() {
  return (
    <div className={CARD_CLASS}>
      <EmptyState
        icon={<BarChart3 size={20} strokeWidth={1.8} />}
        title="No local agent usage yet"
        body="lpm reads token counts from Claude Code and Codex session histories. Usage shows up here after an agent runs in one of your local projects."
      >
        <div className="mt-4 flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
          {(["claude", "codex"] as const).map((key) => {
            const meta = providerMeta(key);
            return (
              <span key={key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                {meta.label}
              </span>
            );
          })}
        </div>
      </EmptyState>
    </div>
  );
}
