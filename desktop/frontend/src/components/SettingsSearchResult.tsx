import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import { pageOf, type SearchHit } from "../settingsSearchHits";
import { SearchHighlight } from "./SearchHighlight";

interface SettingsSearchResultProps {
  hit: SearchHit;
  query: string;
  active: boolean;
  onActivate: () => void;
  onHover: () => void;
}

export function SettingsSearchResult({ hit, query, active, onActivate, onHover }: SettingsSearchResultProps) {
  const { entry, keywords } = hit;
  const ref = useRef<HTMLButtonElement>(null);

  // Arrow keys can move the selection out of view; a hovered result is already
  // in it, and scrolling under the pointer would move the selection again.
  useEffect(() => {
    const el = ref.current;
    if (active && el && !el.matches(":hover")) el.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      onClick={onActivate}
      onMouseMove={onHover}
      className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
        active ? "bg-[var(--bg-active)]" : "hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-[var(--text-primary)]">
          <SearchHighlight text={entry.label} query={query} />
        </span>
        <span className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-[var(--text-muted)]">
          {keywords.length > 0 ? (
            <>
              Matched “{query.trim()}” in: <SearchHighlight text={keywords.join(", ")} query={query} />
            </>
          ) : (
            entry.description && <SearchHighlight text={entry.description} query={query} />
          )}
        </span>
        <span className="mt-1 block truncate text-[10px] text-[var(--text-muted)] opacity-80">
          Settings › <SearchHighlight text={pageOf(entry)} query={query} />
        </span>
      </span>
      {entry.kind === "view" && (
        <ChevronRight size={14} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
      )}
    </button>
  );
}
