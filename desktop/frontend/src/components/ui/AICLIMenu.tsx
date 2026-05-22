import { useState } from "react";
import { AI_CLI_OPTIONS, aiDefaultModel, type AICLI, type AIEffortOption } from "../../types";
import { CheckIcon } from "../icons";

interface AICLIMenuProps {
  aiCLIs: Record<string, boolean>;
  selectedCLI: AICLI;
  selectedModel: string;
  selectedEffort?: string;
  onSelect: (cli: AICLI, model: string) => void;
  onSelectEffort?: (cli: AICLI, effort: string) => void;
  placement?: "up" | "down";
}

export function AICLIMenu({
  aiCLIs,
  selectedCLI,
  selectedModel,
  selectedEffort = "",
  onSelect,
  onSelectEffort,
  placement = "up",
}: AICLIMenuProps) {
  const [editingActive, setEditingActive] = useState(false);
  const positionClass = placement === "down" ? "top-full mt-1" : "bottom-full mb-1";
  const availableCLIs = AI_CLI_OPTIONS.filter((o) => aiCLIs[o.value]);
  const activeOption = availableCLIs.find((o) => o.value === selectedCLI);
  const efforts = (onSelectEffort && activeOption?.efforts) || [];
  const effortAvailable = Boolean(onSelectEffort && efforts.length > 0);
  const showEffortPanel = effortAvailable && editingActive;

  const handleModelClick = (cli: AICLI, model: string, isActive: boolean) => {
    if (isActive) {
      if (effortAvailable) setEditingActive((v) => !v);
      return;
    }
    onSelect(cli, model);
    setEditingActive(false);
  };

  return (
    <div
      className={`absolute right-0 ${positionClass} z-10 flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg`}
    >
      {showEffortPanel && (
        <EffortPanel
          efforts={efforts}
          selectedEffort={selectedEffort}
          onSelect={(value) => onSelectEffort!(selectedCLI, value)}
        />
      )}
      <div className={`flex flex-col py-1.5 ${effortAvailable ? "w-60" : "w-44"}`}>
        {availableCLIs.map((o) => {
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
          const activeEffortLabel = o.efforts?.find((e) => e.value === selectedEffort)?.label;
          return (
            <div key={o.value} className="pb-1">
              <SectionHeader label={o.label} />
              {models.map((m) => {
                const isActive = cliActive && selectedModel === m.value;
                const showEffortBadge = isActive && Boolean(o.efforts && o.efforts.length > 0);
                return (
                  <MenuRow
                    key={m.value || "default"}
                    label={m.label}
                    indent
                    active={isActive}
                    badge={showEffortBadge ? activeEffortLabel ?? "Default" : undefined}
                    edit={isActive && effortAvailable ? (editingActive ? "Editing" : "Edit") : undefined}
                    onClick={() => handleModelClick(o.value, m.value, isActive)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EffortPanel({
  efforts,
  selectedEffort,
  onSelect,
}: {
  efforts: AIEffortOption[];
  selectedEffort: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex w-40 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]/40 py-1.5">
      <SectionHeader label="Effort" />
      {efforts.map((e) => (
        <MenuRow
          key={e.value || "default"}
          label={e.label}
          indent
          active={selectedEffort === e.value}
          onClick={() => onSelect(e.value)}
        />
      ))}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pb-1 pt-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {label}
    </div>
  );
}

function MenuRow({
  label,
  active,
  indent,
  badge,
  edit,
  onClick,
}: {
  label: string;
  active: boolean;
  indent?: boolean;
  badge?: string;
  edit?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-2 py-1.5 pr-3 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
        indent ? "pl-5" : "pl-3"
      } ${
        active
          ? "font-medium text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]"
      }`}
    >
      <span className="truncate">{label}</span>
      {badge && (
        <span className="text-[10px] font-normal text-[var(--text-muted)]">
          {badge}
        </span>
      )}
      {edit && (
        <span className="ml-auto text-[10px] font-normal text-[var(--text-secondary)] opacity-0 transition-opacity group-hover:opacity-100">
          {edit}
        </span>
      )}
      {active && <span className={edit ? "" : "ml-auto"}><CheckIcon /></span>}
    </button>
  );
}
