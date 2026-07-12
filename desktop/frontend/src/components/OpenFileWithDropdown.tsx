import { useMemo, useState } from "react";
import { toast } from "../toast";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useOpenInTargets, type OpenInTarget } from "../hooks/useOpenInTargets";
import { OpenFileInEditor, OpenPathInDefaultApp } from "../../bridge/commands";

const SELECTED_KEY = "lpm.openFileWith.selectedId";
const DEFAULT_APP_ID = "__default_app__";
// Synthetic target injected after the editor list. Empty `icon` is a
// sentinel — TargetIcon renders an inline SVG instead of an <img>.
const DEFAULT_APP_TARGET: OpenInTarget = {
  id: DEFAULT_APP_ID,
  label: "Default app",
  icon: "",
};

interface OpenFileWithDropdownProps {
  absPath: string;
  line: number;
  col: number;
}

export function OpenFileWithDropdown({ absPath, line, col }: OpenFileWithDropdownProps) {
  const [open, setOpen] = useState(false);
  const editorTargets = useOpenInTargets();
  const targets = useMemo<OpenInTarget[]>(
    () => [...editorTargets, DEFAULT_APP_TARGET],
    [editorTargets],
  );
  const [selectedId, setSelectedId] = useState<string>(
    () => localStorage.getItem(SELECTED_KEY) ?? "",
  );
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);

  const selected = useMemo(() => {
    return targets.find((t) => t.id === selectedId) ?? targets[0];
  }, [targets, selectedId]);

  if (!selected) return null;

  const launch = async (t: OpenInTarget) => {
    try {
      if (t.id === DEFAULT_APP_ID) {
        await OpenPathInDefaultApp(absPath);
      } else {
        await OpenFileInEditor(t.id, absPath, line, col);
      }
    } catch (err) {
      toast.error(`Open in ${t.label}: ${err}`);
    }
  };

  const pick = (t: OpenInTarget) => {
    setSelectedId(t.id);
    localStorage.setItem(SELECTED_KEY, t.id);
    setOpen(false);
    void launch(t);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <div className="inline-flex items-stretch rounded-lg border border-[var(--border)]">
        <button
          onClick={() => void launch(selected)}
          title={`Open in ${selected.label}`}
          className="flex items-center gap-2 rounded-l-lg border-r border-[var(--border)] px-2.5 py-1.5 text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <TargetIcon target={selected} />
          <span>Open in {selected.label}</span>
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
        <div className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] py-1.5 shadow-2xl">
          {targets.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] ${
                t.id === selected.id ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
              }`}
            >
              <TargetIcon target={t} />
              <span className="flex-1 truncate">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetIcon({ target }: { target: OpenInTarget }) {
  if (target.id === DEFAULT_APP_ID) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    );
  }
  return <img src={target.icon} alt="" className="h-4 w-4 shrink-0" />;
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
