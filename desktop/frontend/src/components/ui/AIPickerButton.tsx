import { useState } from "react";
import { AIButton } from "./AIButton";
import { AICLIMenu } from "./AICLIMenu";
import { ChevronDownIcon } from "../icons";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import type { AICLI } from "../../types";

interface AIPickerButtonProps {
  onGenerate: () => void;
  generating: boolean;
  disabled?: boolean;
  title?: string;
  label: string;
  generatingLabel?: string;
  aiCLIs: Record<string, boolean>;
  selectedCLI: AICLI;
  selectedModel: string;
  onSelect: (cli: AICLI, model: string) => void;
}

export function AIPickerButton({
  onGenerate,
  generating,
  disabled,
  title,
  label,
  generatingLabel = "Generating...",
  aiCLIs,
  selectedCLI,
  selectedModel,
  onSelect,
}: AIPickerButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false), menuOpen);

  return (
    <div ref={ref} className="relative">
      <AIButton
        onClick={onGenerate}
        disabled={disabled}
        loading={generating}
        title={title}
        trailing={
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={disabled}
            title="Select AI CLI and model"
          >
            <ChevronDownIcon />
          </button>
        }
      >
        {generating ? generatingLabel : label}
      </AIButton>
      {menuOpen && (
        <AICLIMenu
          aiCLIs={aiCLIs}
          selectedCLI={selectedCLI}
          selectedModel={selectedModel}
          onSelect={(cli, model) => {
            setMenuOpen(false);
            onSelect(cli, model);
          }}
        />
      )}
    </div>
  );
}
