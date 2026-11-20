import { useEffect, useState } from "react";
import { GeneratedFileRecord } from "../../bridge/commands";
import { capitalized, type GeneratedRecord } from "../generate";
import { relativeAgo } from "../relativeTime";
import { copyText } from "./files/fileActions";

// How lpm made the file shown above it, when an agent made it with
// `lpm generate`: the prompt, the model, the cost and who asked.
export function GeneratedFileInfo({ absPath }: { absPath: string }) {
  const [record, setRecord] = useState<GeneratedRecord | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setRecord(null);
    GeneratedFileRecord(absPath)
      .then((r) => live && setRecord(r ?? null))
      .catch(() => live && setRecord(null));
    return () => {
      live = false;
    };
  }, [absPath]);

  if (!record) return null;

  const facts = [
    record.label,
    record.voice ? `${capitalized(record.voice)} voice` : "",
    record.width && record.height ? `${record.width}×${record.height}` : "",
    record.cents < 1 ? "under 1¢" : `about ${Math.round(record.cents)}¢`,
    [record.agent, record.project].filter(Boolean).join(" in "),
    relativeAgo(record.at),
  ].filter(Boolean);
  const words = record.kind === "speech" ? "Text" : "Prompt";

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-[var(--text-muted)]">
            {`Made with lpm · ${facts.join(" · ")}`}
          </p>
          <button
            type="button"
            onClick={() => setOpen((on) => !on)}
            aria-expanded={open}
            title={open ? "Show less" : "Show all"}
            className={`mt-0.5 block w-full text-left text-[12.5px] leading-relaxed text-[var(--text-primary)] ${
              open ? "max-h-40 overflow-y-auto whitespace-pre-wrap" : "truncate"
            }`}
          >
            {record.prompt}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void copyText(record.prompt, `${words} copied`)}
          className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)]"
        >
          {`Copy ${words.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
