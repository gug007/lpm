import type { Generator } from "../types";
import { ContextMenuShell } from "./ui/ContextMenuShell";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { useGeneratorsStore } from "../store/generators";

interface GeneratorContextMenuProps {
  generator: Generator;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: (g: Generator) => void;
  onRemove: (g: Generator) => void;
}

export function GeneratorContextMenu({ generator, x, y, onClose, onEdit, onRemove }: GeneratorContextMenuProps) {
  const addCustom = useGeneratorsStore((s) => s.addCustom);

  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <ContextMenuItem label="Edit…" onClick={() => onEdit(generator)} />
      <ContextMenuItem
        label="Duplicate"
        onClick={() => {
          addCustom({
            label: `${generator.label} copy`,
            icon: generator.icon,
            type: generator.type,
            prompt: generator.prompt,
            cli: generator.cli,
            command: generator.command,
          });
          onClose();
        }}
      />
      <ContextMenuItem
        label={generator.builtin ? "Hide" : "Delete…"}
        destructive={!generator.builtin}
        onClick={() => onRemove(generator)}
      />
    </ContextMenuShell>
  );
}
