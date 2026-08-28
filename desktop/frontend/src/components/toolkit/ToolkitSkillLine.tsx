import { useEffect, useMemo, useState, type RefObject } from "react";
import { shortPath } from "../../toolkit";
import type { SkillDestination } from "../../toolkitSkill";
import type { LineToken, LineTrigger } from "../../toolkitSkillLine";
import { lineTokens, matchTokens, parseLine, tokenFor } from "../../toolkitSkillLine";

const CHIP =
  "shrink-0 rounded-[6px] px-1.5 py-[2px] font-mono text-[11px] leading-[16px] transition-colors";

const CHIP_TONE: Record<LineToken["kind"], string> = {
  dest: `${CHIP} bg-[color-mix(in_srgb,var(--accent-blue)_18%,transparent)] text-[var(--accent-blue-text)] hover:bg-[color-mix(in_srgb,var(--accent-blue)_30%,transparent)]`,
  mode: `${CHIP} bg-[color-mix(in_srgb,var(--accent-green)_18%,transparent)] text-[var(--accent-green-text)] hover:bg-[color-mix(in_srgb,var(--accent-green)_30%,transparent)]`,
};

const LIST_ID = "toolkit-skill-line-list";

interface ToolkitSkillLineProps {
  value: string;
  onValue: (value: string) => void;
  destinations: SkillDestination[];
  destPath: string;
  onDest: (path: string) => void;
  manual: boolean;
  manualAllowed: boolean;
  onManual: (manual: boolean) => void;
  slash: string;
  onSubmit: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

// Name, folder and who-runs-it on one line. The two choices that used to be
// five radio rows are chips typed with `@` and `/`: both are defaulted, so the
// line reads back as the whole decision without the user having made any of it
// — which is what the radios were for, at four times the height.
export function ToolkitSkillLine({
  value,
  onValue,
  destinations,
  destPath,
  onDest,
  manual,
  manualAllowed,
  onManual,
  slash,
  onSubmit,
  inputRef,
}: ToolkitSkillLineProps) {
  // "all" is the list the + chip opens: every token, grouped, for anyone who
  // does not know the trigger characters exist yet.
  const [forced, setForced] = useState<LineTrigger | "all" | null>(null);
  const [highlight, setHighlight] = useState(0);

  const parse = parseLine(value);
  const tokens = useMemo(
    () => lineTokens({ destinations, manual, manualAllowed, slash }),
    [destinations, manual, manualAllowed, slash],
  );
  const chosen = tokenFor(tokens, destPath);
  const open = parse.trigger ?? forced;
  const suggestions = useMemo(
    () => (open ? matchTokens(tokens, open === "all" ? null : open, parse.query) : []),
    [open, tokens, parse.query],
  );

  useEffect(() => {
    setHighlight(0);
  }, [value, forced]);

  const close = () => {
    setForced(null);
    // Typing `@dep` and clicking away leaves a fragment that is not a name:
    // dropping it is the only reading that keeps the field honest.
    if (parse.trigger) onValue(parse.name);
  };

  const apply = (token: LineToken) => {
    if (token.disabled) return;
    if (token.kind === "dest") onDest(token.path);
    else onManual(token.token === "/manual");
    onValue(parse.name);
    setForced(null);
    inputRef.current?.focus();
  };

  const openList = (which: LineTrigger | "all") => {
    setForced(which);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && open) {
      // The sub-view closes on Escape from a document listener, and a list
      // standing open is what the key meant.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setHighlight((h) => Math.max(0, Math.min(suggestions.length - 1, h + delta)));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const pick = suggestions[highlight];
        if (pick && !pick.disabled) {
          e.preventDefault();
          apply(pick);
          return;
        }
      }
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      onSubmit();
      return;
    }
    // Nothing left to erase but the mode, and the mode is the only chip that
    // can be absent — the folder is always one of the folders.
    if (e.key === "Backspace" && !value && manual) {
      e.preventDefault();
      onManual(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[34px] cursor-text flex-wrap items-center gap-1.5 rounded-[var(--tk-radius-s)] bg-[var(--tk-panel)] px-3 py-1.5 focus-within:outline focus-within:outline-[1.5px] focus-within:outline-offset-[-1px] focus-within:outline-[var(--accent-blue)]">
        <input
          id="toolkit-skill-name"
          ref={inputRef}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={LIST_ID}
          aria-activedescendant={
            suggestions.length > 0 ? `${LIST_ID}-${highlight}` : undefined
          }
          aria-label="Name, folder and who runs it"
          placeholder="deploy-web"
          // Sized to what it holds so the chips stay beside the name rather
          // than drifting to the far edge of a wide pane. `ch` is close enough
          // in a proportional face, and shrinking covers where it is not.
          style={{ width: `${Math.max(value.length + 2, 12)}ch` }}
          className="min-w-0 max-w-full shrink bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        {chosen && (
          <button
            type="button"
            onClick={() => openList("@")}
            title={`Goes to ${chosen.title}. Type @ to move it.`}
            className={CHIP_TONE.dest}
          >
            {chosen.token}
          </button>
        )}
        {manual && (
          <button
            type="button"
            onClick={() => onManual(false)}
            title="Only you can run it. Click to let your agent pick it up."
            className={CHIP_TONE.mode}
          >
            /manual
          </button>
        )}
        <button
          type="button"
          onClick={() => (open ? close() : openList("all"))}
          aria-label="Choose a folder, or who runs it"
          title="Choose a folder, or who runs it"
          className={`${CHIP} text-[var(--text-muted)] hover:bg-[var(--tk-hover)] hover:text-[var(--text-primary)]`}
        >
          +
        </button>
      </div>

      {suggestions.length > 0 && (
        <div
          id={LIST_ID}
          role="listbox"
          aria-label="Folders and who runs it"
          onMouseDown={(e) => e.preventDefault()}
          className="flex flex-col rounded-[var(--tk-radius-s)] bg-[var(--tk-panel)] p-1"
        >
          {suggestions.map((token, i) => (
            <button
              key={token.token}
              id={`${LIST_ID}-${i}`}
              type="button"
              role="option"
              aria-selected={i === highlight}
              disabled={token.disabled}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => apply(token)}
              className={`flex flex-col gap-0.5 rounded-[var(--tk-radius-s)] px-2 py-1 text-left transition-colors disabled:opacity-40 ${
                i === highlight ? "bg-[var(--tk-active)]" : ""
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span
                  className={`font-mono text-[11.5px] ${
                    token.kind === "dest"
                      ? "text-[var(--accent-blue-text)]"
                      : "text-[var(--accent-green-text)]"
                  }`}
                >
                  {token.token}
                </span>
                <span className="min-w-0 truncate text-[12.5px] text-[var(--text-primary)]">
                  {token.title}
                </span>
              </span>
              <span
                className={`truncate text-[11px] leading-snug text-[var(--text-muted)] ${
                  token.kind === "dest" ? "font-mono" : ""
                }`}
              >
                {token.kind === "dest"
                  ? `${shortPath(token.path)}${token.hint ? ` — ${token.hint}` : ""}`
                  : token.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
