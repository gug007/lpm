import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ListOpenInTargets, OpenIn } from "../../wailsjs/go/main/App";
import { main } from "../../wailsjs/go/models";
import { useOutsideClick } from "../hooks/useOutsideClick";

type OpenInTarget = main.OpenInTarget;

const SELECTED_KEY = "lpm.openIn.selectedId";

// Cached across component remounts — the target list doesn't change until app restart.
let targetsCache: OpenInTarget[] | null = null;

export function OpenInDropdown({ projectPath }: {
  projectPath: string;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<OpenInTarget[]>(targetsCache ?? []);
  const [selectedId, setSelectedId] = useState<string>(() => localStorage.getItem(SELECTED_KEY) ?? "");
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  useEffect(() => {
    if (targetsCache) return;
    ListOpenInTargets().then((list) => {
      targetsCache = list;
      setTargets(list);
    }).catch(() => {});
  }, []);

  const selected = useMemo(() => {
    if (targets.length === 0) return null;
    return targets.find((t) => t.id === selectedId) ?? targets[0];
  }, [targets, selectedId]);

  if (targets.length === 0 || !selected) return null;

  const launch = async (t: OpenInTarget) => {
    try {
      await OpenIn(t.id, projectPath);
    } catch (err) {
      toast.error(`Open in ${t.label}: ${err}`);
    }
  };

  const pick = (t: OpenInTarget) => {
    setSelectedId(t.id);
    localStorage.setItem(SELECTED_KEY, t.id);
    setOpen(false);
    launch(t);
  };

  return (
    <div ref={ref} className="relative">
      <div className="inline-flex items-stretch rounded-lg border border-[var(--border)]">
        <button
          onClick={() => launch(selected)}
          title={`Open in ${selected.label}`}
          className="flex items-center rounded-l-lg border-r border-[var(--border)] px-2 py-1 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <img src={selected.icon} alt="" className="h-4 w-4" />
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Choose app"
          className={`flex items-center rounded-r-lg px-1.5 transition-colors hover:bg-[var(--bg-hover)] ${
            open ? "bg-[var(--bg-active)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
          }`}
        >
          <ChevronDown />
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-[var(--bg-hover)] ${
                t.id === selected.id ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              }`}
            >
              <img src={t.icon} alt="" className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
