import { useEffect, useState, type KeyboardEvent } from "react";
import {
  Bug,
  CircleHelp,
  ExternalLink,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { GetPlatform, GetVersion } from "../../bridge/commands";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { useAppStore } from "../store/app";
import { XIcon } from "./icons";
import { Modal } from "./ui/Modal";

const REPO = "gug007/lpm";

type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  rows?: number;
};

type KindDef = {
  value: "bug" | "suggestion" | "question";
  title: string;
  description: string;
  label: string;
  icon: LucideIcon;
  titleHint: string;
  fields: FieldDef[];
};

const KINDS: KindDef[] = [
  {
    value: "bug",
    title: "Bug",
    description: "Something isn't working",
    label: "bug",
    icon: Bug,
    titleHint: "Short summary of the bug",
    fields: [
      {
        key: "what",
        label: "What happened?",
        rows: 3,
        placeholder: "Describe what went wrong…",
      },
      {
        key: "steps",
        label: "Steps to reproduce",
        rows: 4,
        placeholder: "1. \n2. \n3. ",
      },
      {
        key: "expected",
        label: "Expected",
        placeholder: "What you thought would happen",
      },
      {
        key: "actual",
        label: "Actual",
        placeholder: "What actually happened",
      },
    ],
  },
  {
    value: "suggestion",
    title: "Idea",
    description: "Suggest an improvement",
    label: "enhancement",
    icon: Lightbulb,
    titleHint: "One-line summary of the idea",
    fields: [
      {
        key: "what",
        label: "What would you like to see?",
        rows: 5,
        placeholder: "Paint the picture…",
      },
    ],
  },
  {
    value: "question",
    title: "Question",
    description: "Ask how something works",
    label: "question",
    icon: CircleHelp,
    titleHint: "Your question in one line",
    fields: [
      {
        key: "question",
        label: "What would you like to know?",
        rows: 5,
        placeholder: "Give us enough context to help…",
      },
    ],
  },
];

function composeBody(kind: KindDef, values: Record<string, string>) {
  return kind.fields
    .map((field) => {
      const value = (values[field.key] || "").trim();
      return `**${field.label}**\n${value || "_(no details)_"}`;
    })
    .join("\n\n");
}

function strictEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*~]/g,
    (character) =>
      "%" + character.charCodeAt(0).toString(16).toUpperCase(),
  );
}

export function FeedbackModal() {
  const open = useAppStore((state) => state.feedbackOpen);
  const setFeedbackOpen = useAppStore((state) => state.setFeedbackOpen);
  const [kind, setKind] = useState<KindDef | null>(null);
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState("");

  const onClose = () => setFeedbackOpen(false);

  useEffect(() => {
    if (!open) {
      setKind(null);
      setTitle("");
      setValues({});
      return;
    }
    GetVersion().then(setVersion).catch(() => setVersion(""));
    GetPlatform().then(setPlatform).catch(() => setPlatform(""));
  }, [open]);

  const pickKind = (next: KindDef) => {
    setKind(next);
    setValues({});
  };

  useKeyboardShortcut(
    KINDS.map((_, index) => ({
      key: String(index + 1),
      meta: false,
      alt: false,
    })),
    (_event, matched) => pickKind(KINDS[Number(matched.key) - 1]),
    open && !kind,
  );

  const handleSubmit = () => {
    if (!kind || !title.trim()) return;
    const body = composeBody(kind, values);
    const footer = `\n\n---\nlpm ${version || "dev"} · ${platform || navigator.platform}`;
    const query =
      `title=${strictEncode(title.trim())}` +
      `&body=${strictEncode(body + footer)}` +
      `&labels=${strictEncode(kind.label)}`;
    BrowserOpenURL(`https://github.com/${REPO}/issues/new?${query}`);
    onClose();
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  const isValid = !!kind && title.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
        onKeyDown={handleFormKeyDown}
        className="flex max-h-[min(760px,calc(100vh-48px))] min-h-0 flex-col"
      >
        <div className="flex items-start gap-4 px-6 pb-5 pt-6">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
              Send feedback
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
              Share a bug, idea, or question with the lpm team.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <fieldset>
            <legend className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">
              Feedback type
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((option, index) => {
                const Icon = option.icon;
                const selected = kind?.value === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => pickKind(option)}
                    aria-pressed={selected}
                    className={`flex min-w-0 flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? "border-[var(--text-secondary)] bg-[var(--bg-active)]"
                        : "border-[var(--border)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Icon
                        size={16}
                        strokeWidth={1.8}
                        className="text-[var(--text-secondary)]"
                      />
                      <span className="font-mono text-[9px] text-[var(--text-muted)]">
                        {index + 1}
                      </span>
                    </div>
                    <span className="mt-2 text-[12px] font-medium text-[var(--text-primary)]">
                      {option.title}
                    </span>
                    <span className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {kind && (
            <div className="mt-5 space-y-4 border-t border-[var(--border)] pt-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[11px] font-medium text-[var(--text-secondary)]">
                    Title
                  </label>
                  <span className="font-mono text-[9px] text-[var(--text-muted)]">
                    {title.length}/120
                  </span>
                </div>
                <input
                  autoFocus
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={kind.titleHint}
                  maxLength={120}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                />
              </div>

              {kind.fields.map((field) => (
                <div key={field.key}>
                  <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                    {field.label}
                  </label>
                  {(field.rows ?? 0) > 0 ? (
                    <textarea
                      value={values[field.key] || ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      rows={field.rows}
                      className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-[12px] leading-relaxed text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                    />
                  ) : (
                    <input
                      value={values[field.key] || ""}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)]"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] bg-[var(--bg-secondary)]/40 px-6 py-4">
          <p className="text-[10px] text-[var(--text-muted)]">
            Opens a prefilled GitHub issue
          </p>
          <button
            type="submit"
            disabled={!isValid}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[11px] font-semibold text-[var(--bg-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Open GitHub issue
            <ExternalLink size={12} strokeWidth={2} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
