import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "./ui/Modal";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { GetVersion, GetPlatform } from "../../wailsjs/go/main/App";
import { XIcon, ChevronLeftIcon } from "./icons";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";

interface FeedbackModalProps {
  onClose: () => void;
}

const REPO = "gug007/lpm";

function BugIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="13" rx="5" ry="7" />
      <path d="M12 6V3" />
      <path d="M9 4l1 2" />
      <path d="M15 4l-1 2" />
      <path d="M7 10 4 8" />
      <path d="M7 13H3" />
      <path d="m7 17-3 2" />
      <path d="m17 10 3-2" />
      <path d="M17 13h4" />
      <path d="m17 17 3 2" />
      <path d="M12 8v12" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M12 2a7 7 0 0 0-5 11.9c.8.9 1.5 2 1.5 3.1h7c0-1.1.7-2.2 1.5-3.1A7 7 0 0 0 12 2Z" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.5-2.4 2.2-2.4 3.8" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </svg>
  );
}

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  rows?: number;
};

type KindDef = {
  value: "bug" | "suggestion" | "question";
  title: string;
  tagline: string;
  label: string;
  accent: string;
  icon: ReactNode;
  titleHint: string;
  fields: FieldDef[];
};

const KINDS: KindDef[] = [
  {
    value: "bug",
    title: "Report a bug",
    tagline: "Something isn't working the way it should",
    label: "bug",
    accent: "var(--accent-red)",
    icon: <BugIcon />,
    titleHint: "Short summary of the bug",
    fields: [
      { key: "what", label: "What happened?", rows: 3, placeholder: "Describe what went wrong…" },
      { key: "steps", label: "Steps to reproduce", rows: 4, placeholder: "1. \n2. \n3. " },
      { key: "expected", label: "Expected", placeholder: "What you thought would happen" },
      { key: "actual", label: "Actual", placeholder: "What actually happened" },
    ],
  },
  {
    value: "suggestion",
    title: "Suggest an idea",
    tagline: "Improvements, features, polish",
    label: "enhancement",
    accent: "var(--accent-blue)",
    icon: <BulbIcon />,
    titleHint: "One-line summary of the idea",
    fields: [
      { key: "what", label: "What would you like to see?", rows: 5, placeholder: "Paint the picture…" },
    ],
  },
  {
    value: "question",
    title: "Ask a question",
    tagline: "Clarify how something works",
    label: "question",
    accent: "var(--accent-cyan)",
    icon: <QuestionIcon />,
    titleHint: "Your question in one line",
    fields: [
      { key: "question", label: "What would you like to know?", rows: 5, placeholder: "Give us enough context to help…" },
    ],
  },
];

function composeBody(kind: KindDef, values: Record<string, string>) {
  return kind.fields
    .map((f) => {
      const v = (values[f.key] || "").trim();
      return `**${f.label}**\n${v || "_(no details)_"}`;
    })
    .join("\n\n");
}

// Wails v2 rejects URLs containing any of ! ' ( ) * ~ ; $ | ` < > { } [ ] space
// etc. via a shell-metacharacter blacklist, and URLSearchParams leaves ! ' ( ) *
// ~ unescaped. Encode strictly so the URL passes validation and the browser
// actually opens.
function strictEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*~]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const [kind, setKind] = useState<KindDef | null>(null);
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState("");

  useEffect(() => {
    GetVersion().then(setVersion).catch(() => setVersion(""));
    GetPlatform().then(setPlatform).catch(() => setPlatform(""));
  }, []);

  const pickKind = (k: KindDef) => {
    setKind(k);
    setValues({});
    setTitle("");
  };

  useKeyboardShortcut(
    KINDS.map((_, idx) => ({ key: String(idx + 1), meta: false, alt: false })),
    (_e, matched) => pickKind(KINDS[Number(matched.key) - 1]),
    !kind,
  );

  const handleSubmit = () => {
    if (!kind) return;
    const body = composeBody(kind, values);
    const footer = `\n\n---\nlpm ${version || "dev"} \u00B7 ${platform || navigator.platform}`;
    const query =
      `title=${strictEncode(title.trim())}` +
      `&body=${strictEncode(body + footer)}` +
      `&labels=${strictEncode(kind.label)}`;
    BrowserOpenURL(`https://github.com/${REPO}/issues/new?${query}`);
    onClose();
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isValid = !!kind && title.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="feedback-enter w-[620px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <style>{`
        @keyframes feedback-enter {
          from { opacity: 0; transform: translateY(6px) scale(0.985); }
          to { opacity: 1; transform: none; }
        }
        @keyframes feedback-item-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; }
        }
        .feedback-enter { animation: feedback-enter 220ms cubic-bezier(0.2, 0.9, 0.3, 1) both; }
        .feedback-stagger > * { animation: feedback-item-in 280ms cubic-bezier(0.2, 0.9, 0.3, 1) both; }
        .feedback-stagger > *:nth-child(1) { animation-delay: 40ms; }
        .feedback-stagger > *:nth-child(2) { animation-delay: 80ms; }
        .feedback-stagger > *:nth-child(3) { animation-delay: 120ms; }
        .feedback-stagger > *:nth-child(4) { animation-delay: 160ms; }
        .feedback-stagger > *:nth-child(5) { animation-delay: 200ms; }
        .feedback-stagger > *:nth-child(6) { animation-delay: 240ms; }
      `}</style>

      <div
        className="h-[3px] w-full transition-colors duration-300"
        style={{
          background: kind
            ? kind.accent
            : "linear-gradient(90deg, var(--accent-red), var(--accent-blue), var(--accent-cyan))",
        }}
      />

      <div className="flex items-center px-6 pt-5 pb-4">
        {kind && (
          <button
            onClick={() => setKind(null)}
            className="mr-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title="Back"
          >
            <ChevronLeftIcon />
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Feedback
          </span>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {kind ? kind.title : "Send feedback"}
            </h3>
            {kind && (
              <span
                className="rounded-full border px-2 py-[1px] font-mono text-[10px] leading-tight"
                style={{
                  borderColor: kind.accent,
                  color: kind.accent,
                  background: `color-mix(in srgb, ${kind.accent} 10%, transparent)`,
                }}
              >
                {kind.label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          title="Close"
        >
          <XIcon />
        </button>
      </div>

      {!kind && (
        <div className="px-6 pb-6">
          <p className="mb-4 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            Help shape lpm. Pick what you're sending — we'll open a prefilled issue on GitHub.
          </p>
          <div className="feedback-stagger flex flex-col gap-2">
            {KINDS.map((k, idx) => (
              <button
                key={k.value}
                onClick={() => pickKind(k)}
                className="group relative flex items-center gap-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3.5 text-left transition-all hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                <span
                  className="absolute inset-y-0 left-0 w-[2px] opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: k.accent }}
                />
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] transition-all group-hover:scale-[1.04]"
                  style={{
                    color: k.accent,
                    background: `color-mix(in srgb, ${k.accent} 8%, transparent)`,
                  }}
                >
                  {k.icon}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                    {k.title}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">{k.tagline}</span>
                </div>
                <kbd className="flex h-5 w-5 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-secondary)] font-mono text-[10px] text-[var(--text-muted)]">
                  {idx + 1}
                </kbd>
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              {KINDS.map((_, idx) => (
                <kbd
                  key={idx}
                  className="flex h-4 min-w-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 font-mono text-[10px]"
                >
                  {idx + 1}
                </kbd>
              ))}
              <span className="ml-1">to pick</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="flex h-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 font-mono text-[10px]">
                Esc
              </kbd>
              <span>to close</span>
            </span>
          </div>
        </div>
      )}

      {kind && (
        <>
          <div key={kind.value} className="feedback-stagger flex flex-col gap-4 px-6 pb-5">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  Title
                </label>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {title.length}/120
                </span>
              </div>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleFormKeyDown}
                placeholder={kind.titleHint}
                maxLength={120}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
              />
            </div>

            {kind.fields.map((f) => (
              <div key={f.key}>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                  {f.label}
                </label>
                {(f.rows ?? 0) > 0 ? (
                  <textarea
                    value={values[f.key] || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    onKeyDown={handleFormKeyDown}
                    placeholder={f.placeholder}
                    rows={f.rows}
                    className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-2.5 text-[12px] leading-relaxed text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                  />
                ) : (
                  <input
                    value={values[f.key] || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.key]: e.target.value }))
                    }
                    onKeyDown={handleFormKeyDown}
                    placeholder={f.placeholder}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                  />
                )}
              </div>
            ))}

          </div>

          <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--bg-secondary)]/40 px-6 py-3">
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
              <kbd className="flex h-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 font-mono text-[10px]">
                {"\u2318\u21B5"}
              </kbd>
              <span>submit</span>
              <span className="opacity-50">·</span>
              <kbd className="flex h-4 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 font-mono text-[10px]">
                Esc
              </kbd>
              <span>close</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setKind(null)}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!isValid}
                className="rounded-md bg-[var(--text-primary)] px-3.5 py-1.5 text-[11px] font-semibold text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Open on GitHub ↗
              </button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
