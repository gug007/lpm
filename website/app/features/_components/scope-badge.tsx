import type { FeatureScope } from "./feature-types";

const SCOPES: Record<FeatureScope, { label: string; dots: string[] }> = {
  "claude-codex": {
    label: "Claude Code + Codex",
    dots: ["bg-[#D97757]", "bg-[#10A37F]"],
  },
  claude: { label: "Claude Code only", dots: ["bg-[#D97757]"] },
  github: { label: "GitHub + gh CLI", dots: ["bg-gray-400 dark:bg-gray-500"] },
};

export default function ScopeBadge({ scope }: { scope: FeatureScope }) {
  const { label, dots } = SCOPES[scope];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-300">
      <span className="flex -space-x-0.5" aria-hidden>
        {dots.map((dot) => (
          <span
            key={dot}
            className={`h-1.5 w-1.5 rounded-full ring-1 ring-white dark:ring-[#161616] ${dot}`}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
