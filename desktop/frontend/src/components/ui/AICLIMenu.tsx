import { useState } from "react";
import {
  AI_CLI_OPTIONS,
  aiDefaultModel,
  aiSupportsFast,
  type AICLI,
  type AIEffortOption,
} from "../../types";
import { CheckIcon } from "../icons";
import { useMenuMaxHeight } from "../../hooks/useMenuMaxHeight";

interface AICLIMenuProps {
  aiCLIs: Record<string, boolean>;
  selectedCLI: AICLI;
  selectedModel: string;
  selectedEffort?: string;
  selectedFast?: boolean;
  onSelect: (cli: AICLI, model: string) => void;
  onSelectEffort?: (cli: AICLI, effort: string) => void;
  onSelectFast?: (cli: AICLI, fast: boolean) => void;
  placement?: "up" | "down";
}

export function AICLIMenu({
  aiCLIs,
  selectedCLI,
  selectedModel,
  selectedEffort = "",
  selectedFast = false,
  onSelect,
  onSelectEffort,
  onSelectFast,
  placement = "up",
}: AICLIMenuProps) {
  const [editingActive, setEditingActive] = useState(false);
  const positionClass = placement === "down" ? "top-full mt-1.5" : "bottom-full mb-1.5";
  const { ref, maxHeight } = useMenuMaxHeight<HTMLDivElement>(placement);
  const availableCLIs = AI_CLI_OPTIONS.filter((o) => aiCLIs[o.value]);
  const activeOption = availableCLIs.find((o) => o.value === selectedCLI);
  const efforts = (onSelectEffort && activeOption?.efforts) || [];
  const effortAvailable = Boolean(onSelectEffort && efforts.length > 0);
  const fastAvailable = Boolean(onSelectFast) && aiSupportsFast(selectedCLI, selectedModel);
  const showEffortPanel = (effortAvailable || fastAvailable) && editingActive;
  const editableActive = effortAvailable || fastAvailable;

  const handleModelClick = (cli: AICLI, model: string, isActive: boolean) => {
    if (isActive) {
      if (editableActive) setEditingActive((v) => !v);
      return;
    }
    onSelect(cli, model);
    setEditingActive(false);
  };

  return (
    <div
      ref={ref}
      style={{ maxHeight }}
      className={`absolute right-0 ${positionClass} z-10 flex overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)]`}
    >
      {showEffortPanel && (
        <EffortPanel
          efforts={efforts}
          selectedEffort={selectedEffort}
          onSelectEffort={(value) => onSelectEffort!(selectedCLI, value)}
          fastAvailable={fastAvailable}
          selectedFast={selectedFast}
          onToggleFast={fastAvailable ? () => onSelectFast!(selectedCLI, !selectedFast) : undefined}
        />
      )}
      <div
        className={`flex min-h-0 flex-col overflow-y-auto p-1.5 ${
          effortAvailable || fastAvailable ? "w-60" : "w-44"
        }`}
      >
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
            <div key={o.value} className="pb-1 last:pb-0">
              <SectionHeader label={o.label} />
              {models.map((m) => {
                const isActive = cliActive && selectedModel === m.value;
                const modelFastAvailable = Boolean(onSelectFast) && aiSupportsFast(o.value, m.value);
                const modelEditable = effortAvailable || modelFastAvailable;
                const badge = isActive
                  ? rowBadge(o.efforts, activeEffortLabel, modelFastAvailable, selectedFast)
                  : undefined;
                return (
                  <MenuRow
                    key={m.value || "default"}
                    label={m.label}
                    indent
                    active={isActive}
                    badge={badge}
                    edit={isActive && modelEditable ? (editingActive ? "Editing" : "Edit") : undefined}
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
  onSelectEffort,
  fastAvailable,
  selectedFast,
  onToggleFast,
}: {
  efforts: AIEffortOption[];
  selectedEffort: string;
  onSelectEffort: (value: string) => void;
  fastAvailable: boolean;
  selectedFast: boolean;
  onToggleFast?: () => void;
}) {
  return (
    <div className="flex min-h-0 w-40 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-secondary)]/40 p-1.5">
      {efforts.length > 0 && (
        <>
          <SectionHeader label="Effort" />
          {efforts.map((e) => (
            <MenuRow
              key={e.value || "default"}
              label={e.label}
              indent
              active={selectedEffort === e.value}
              onClick={() => onSelectEffort(e.value)}
            />
          ))}
        </>
      )}
      {fastAvailable && onToggleFast && (
        <>
          <SectionHeader label="Speed" />
          <MenuRow
            label="Fast"
            indent
            active={selectedFast}
            onClick={onToggleFast}
          />
        </>
      )}
    </div>
  );
}

function rowBadge(
  efforts: AIEffortOption[] | undefined,
  effortLabel: string | undefined,
  fastAvailable: boolean,
  fastOn: boolean,
): string | undefined {
  const hasEffort = Boolean(efforts && efforts.length > 0);
  if (!hasEffort && !fastAvailable) return undefined;
  const parts: string[] = [];
  if (hasEffort) parts.push(effortLabel ?? "Default");
  if (fastAvailable && fastOn) parts.push("Fast");
  return parts.join(" · ");
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-1.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
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
      className={`group flex w-full items-center gap-2 rounded-lg py-1.5 pr-2.5 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
        indent ? "pl-3.5" : "pl-2.5"
      } ${
        active
          ? "bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]"
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
      {active && (
        <span className={`text-[var(--text-primary)] ${edit ? "" : "ml-auto"}`}>
          <CheckIcon />
        </span>
      )}
    </button>
  );
}
