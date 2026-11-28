import type { ReactNode } from "react";
import { AudioLines, Loader2 } from "lucide-react";
import { FLOATING_CARD_TILE } from "../ui/floatingCard";
import "../dictation/dictation.css";

export type TalkTile = "rest" | "listening" | "working";

interface TalkCardHeaderProps {
  id: string;
  tile: TalkTile;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

// The card's top line through every step, so the card keeps its shape from
// the question to the plan: the tile and title say what it's doing.
export function TalkCardHeader({ id, tile, title, subtitle, children }: TalkCardHeaderProps) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden className={FLOATING_CARD_TILE}>
        {tile === "listening" ? (
          <span className="dictation-head h-2 w-2 rounded-full" />
        ) : tile === "working" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <AudioLines size={15} />
        )}
      </span>
      <div aria-live="polite" className="min-w-0 flex-1">
        <h2 id={id} className="truncate text-sm font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
        <p className="truncate text-[11.5px] leading-4 text-[var(--text-muted)]">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
