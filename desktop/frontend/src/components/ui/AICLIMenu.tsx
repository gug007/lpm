import { AI_CLI_OPTIONS, aiDefaultModel, type AICLI } from "../../types";
import { CheckIcon } from "../icons";

interface AICLIMenuProps {
  aiCLIs: Record<string, boolean>;
  selectedCLI: AICLI;
  selectedModel: string;
  onSelect: (cli: AICLI, model: string) => void;
}

export function AICLIMenu({
  aiCLIs,
  selectedCLI,
  selectedModel,
  onSelect,
}: AICLIMenuProps) {
  return (
    <div className="absolute right-0 bottom-full z-10 mb-1 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
      {AI_CLI_OPTIONS.filter((o) => aiCLIs[o.value]).map((o) => {
        const cliActive = selectedCLI === o.value;
        const models = o.models ?? [];
        if (models.length === 0) {
          return (
            <MenuRow
              key={o.value}
              label={o.label}
              active={cliActive}
              onClick={() => onSelect(o.value, aiDefaultModel(o.value))}
            />
          );
        }
        return (
          <div key={o.value}>
            <div className="px-3 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {o.label}
            </div>
            {models.map((m) => (
              <MenuRow
                key={m.value || "default"}
                label={m.label}
                indent
                active={cliActive && selectedModel === m.value}
                onClick={() => onSelect(o.value, m.value)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MenuRow({
  label,
  active,
  indent,
  onClick,
}: {
  label: string;
  active: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center py-1.5 pr-3 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
        indent ? "pl-5" : "pl-3"
      } ${
        active
          ? "font-medium text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]"
      }`}
    >
      {label}
      {active && <span className="ml-auto"><CheckIcon /></span>}
    </button>
  );
}
