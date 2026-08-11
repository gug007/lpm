import type { AgentCapability, CapabilityKind } from "../../toolkit";
import { KIND_LABELS, formatTokenCount, formatTokens } from "../../toolkit";
import type { BudgetSegment } from "../../toolkitBudget";
import { axisTicks, buildLedger, excludedSummary, hasBudget } from "../../toolkitBudget";

const SEGMENT_COLORS: Record<CapabilityKind, string> = {
  instructions: "var(--accent-cyan)",
  skill: "var(--accent-green)",
  subagent: "var(--accent-purple)",
  mcp: "var(--accent-blue)",
  plugin: "var(--accent-teal)",
  command: "var(--accent-orange)",
  hook: "var(--accent-slate)",
};

const KIND_CAVEATS: Partial<Record<CapabilityKind, string>> = {
  instructions: "read in full, every turn",
  skill: "name and description only",
  subagent: "name and description only",
};

// Sized to its own share of the total rather than to a percentage width, so the
// gaps between blocks never make the arithmetic look wrong.
function Segment({ segment }: { segment: BudgetSegment }) {
  const color = SEGMENT_COLORS[segment.kind];
  const figure = formatTokens(segment.bytes);
  return (
    <div
      title={`${segment.label} · ~${formatTokens(segment.bytes)} tokens — ${segment.title}`}
      style={{
        flex: `${Math.max(segment.bytes, 1)} 1 0`,
        borderTopColor: color,
        background: `color-mix(in srgb, ${color} 22%, transparent)`,
      }}
      className="@container flex min-w-[3px] flex-col justify-between overflow-hidden rounded-[2px] border-t-2 px-1.5 py-1"
    >
      {/* Gated on the block's own width, not on its share: the same 4% block is
          readable in a wide pane and three pixels wide in a split. A clipped
          name still reads as a name; a clipped figure reads as a different
          number, so it waits for room to hold the whole thing. */}
      <span className="hidden truncate font-mono text-[10px] leading-none text-[var(--text-secondary)] @min-[36px]:block">
        {segment.label}
      </span>
      <span
        className={`hidden text-[12px] font-semibold leading-none tabular-nums text-[var(--text-primary)] ${
          figure.length >= 5 ? "@min-[40px]:block" : "@min-[28px]:block"
        }`}
      >
        {figure}
      </span>
    </div>
  );
}

// What the agent carries into every turn before the user types. Only the parts
// that can be measured honestly are in the number; the rest is drawn as an
// explicitly unmeasured block, because a headline figure that is visibly wrong
// discredits the pane.
export function ToolkitBudget({ items }: { items: AgentCapability[] }) {
  const ledger = buildLedger(items);
  if (!hasBudget(ledger)) return null;

  const { bytes, servers, segments } = ledger;
  const ticks = axisTicks(bytes);
  // The unmeasured block is deliberately off the scale: it takes a fixed slice
  // of the bar rather than a width that would imply a size nobody measured.
  const measured = servers > 0 ? 68 : 100;
  const made = [
    ledger.files > 0 && `${ledger.files} instruction file${ledger.files === 1 ? "" : "s"}`,
    ledger.skills > 0 && `${ledger.skills} skill description${ledger.skills === 1 ? "" : "s"}`,
    ledger.subagents > 0 &&
      `${ledger.subagents} subagent description${ledger.subagents === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex shrink-0 flex-col rounded-[var(--tk-radius)] bg-[var(--tk-panel)] px-3 pb-2 pt-2.5">
      <div className="flex items-baseline gap-2">
        {bytes > 0 && (
          <span className="text-[19px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-[var(--text-primary)]">
            ~{formatTokens(bytes)}
          </span>
        )}
        <span className="line-clamp-2 min-w-0 flex-1 text-[11px] text-[var(--text-secondary)]">
          {bytes > 0 ? (
            <>
              tokens in context{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                before you type anything
              </span>
              {made.length > 0 && ` — ${made.join(", ")}`}
            </>
          ) : (
            <>
              Nothing measurable loads{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                before you type anything
              </span>{" "}
              — only MCP tool schemas, which are not counted here.
            </>
          )}
        </span>
        {bytes > 0 && (
          <span
            title="Counted from file size at roughly four characters per token, not from the model's tokeniser."
            className="shrink-0 rounded-[3px] border border-[color-mix(in_srgb,var(--accent-amber)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent-amber)_12%,transparent)] px-1.5 text-[9.5px] uppercase tracking-[0.06em] text-[var(--accent-amber-text)]"
          >
            Estimate
          </span>
        )}
      </div>

      <div className="mt-2 flex h-[46px] gap-[3px]">
        {bytes > 0 && (
          <div style={{ flex: `0 0 ${measured}%` }} className="flex min-w-0 gap-[2px]">
            {segments.map((segment) => (
              <Segment key={segment.id} segment={segment} />
            ))}
          </div>
        )}
        {servers > 0 && (
          <div
            title="Measuring a server's tool schemas means connecting to it, which lpm will not do as part of a refresh."
            className="flex min-w-0 flex-1 flex-col justify-between rounded-[2px] border border-dashed border-[color-mix(in_srgb,var(--text-muted)_55%,transparent)] px-1.5 py-1 [background-image:repeating-linear-gradient(45deg,color-mix(in_srgb,var(--text-muted)_40%,transparent)_0_1px,transparent_1px_5px)]"
          >
            <span className="truncate font-mono text-[10px] leading-none text-[var(--text-secondary)]">
              {servers} MCP server{servers === 1 ? "" : "s"}
            </span>
            <span className="truncate text-[10px] font-semibold leading-none text-[var(--text-muted)]">
              ? tool schemas not counted
            </span>
          </div>
        )}
      </div>

      {ticks.length > 0 && (
        <div
          aria-hidden
          style={{ width: `${measured}%` }}
          className="relative mt-[3px] h-[13px] text-[9.5px] tabular-nums text-[var(--text-muted)]"
        >
          {ticks.map((tick, index) => (
            <span
              key={tick.tokens}
              style={{
                left: `${tick.at * 100}%`,
                transform:
                  index === 0
                    ? "none"
                    : tick.at === 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
              className="absolute top-0"
            >
              {formatTokenCount(tick.tokens)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[10px] text-[var(--text-secondary)]">
        {ledger.byKind.map((group) => (
          <span key={group.kind} className="flex items-center gap-1.5">
            <i
              style={{ background: SEGMENT_COLORS[group.kind] }}
              className="h-[7px] w-[7px] shrink-0 rounded-[1px]"
            />
            {KIND_LABELS[group.kind].toLowerCase()}{" "}
            <span className="tabular-nums">{formatTokens(group.bytes)}</span>
            <span className="text-[var(--text-muted)]">— {KIND_CAVEATS[group.kind]}</span>
          </span>
        ))}
        {servers > 0 && (
          <span className="flex items-center gap-1.5">
            <i className="h-[7px] w-[7px] shrink-0 rounded-[1px] border border-dashed border-[color-mix(in_srgb,var(--text-muted)_60%,transparent)]" />
            schemas load up front; measuring them means connecting
          </span>
        )}
      </div>

      <p
        title={excludedSummary(ledger)}
        className="mt-1 line-clamp-2 text-[10px] leading-snug text-[var(--text-muted)]"
      >
        <span className="font-semibold text-[var(--text-secondary)]">Not in the bar:</span>{" "}
        {excludedSummary(ledger)}
      </p>
    </div>
  );
}
