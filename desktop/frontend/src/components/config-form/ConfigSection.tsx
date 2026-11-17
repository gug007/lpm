import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Plus } from "lucide-react";
import { CAPS_LABEL } from "../settings/sectionStyles";
import { BTN_SECONDARY_SM } from "../ui/buttons";
import { CARD_CLASS } from "../ui/fields";
import { CountBadge } from "../ui/CountBadge";

interface ConfigSectionProps {
  title: string;
  count: number;
  icon: LucideIcon;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}

export function ConfigSection({ title, count, icon: Icon, addLabel, onAdd, children }: ConfigSectionProps) {
  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-2 pl-1">
        <Icon size={13} strokeWidth={1.9} aria-hidden className="shrink-0 text-[var(--text-muted)]" />
        <h2 className={CAPS_LABEL}>{title}</h2>
        <CountBadge count={count} label={title.toLowerCase()} tone="neutral" />
        <button type="button" onClick={onAdd} className={`${BTN_SECONDARY_SM} ml-auto flex items-center gap-1`}>
          <Plus size={13} strokeWidth={2} />
          {addLabel}
        </button>
      </div>
      <div className={`divide-y divide-[var(--border)] overflow-hidden ${CARD_CLASS}`}>
        {children}
      </div>
    </section>
  );
}
