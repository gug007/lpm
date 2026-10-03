import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon, XIcon } from "../icons";
import { FIELD_CLASS } from "../ui/fields";

interface ZoneLayerRowProps {
  id: string;
  index: number;
  label: string;
  removable: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
}

const ICON_BUTTON =
  "flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]";

export function ZoneLayerRow({ id, index, label, removable, onRename, onRemove }: ZoneLayerRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const name = `Layer ${index + 1}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : undefined }}
      className="flex items-center gap-1"
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder ${name}`}
        className={`${ICON_BUTTON} cursor-grab hover:text-[var(--text-secondary)] active:cursor-grabbing`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon />
      </button>
      <input
        value={label}
        onChange={(e) => onRename(e.target.value)}
        placeholder={name}
        aria-label={`${name} name`}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`min-w-0 flex-1 px-2.5 py-1.5 ${FIELD_CLASS}`}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!removable}
        aria-label={`Remove layer ${index + 1}`}
        title={removable ? undefined : "One of the zone's layers stays to hold its buttons"}
        className={`${ICON_BUTTON} hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}
      >
        <XIcon />
      </button>
    </li>
  );
}
