import { useEffect, useState, type KeyboardEvent } from "react";
import { CircleDot, ExternalLink, MessagesSquare } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { GetPlatform, GetVersion } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { FeedbackKindPicker } from "./FeedbackKindPicker";
import { FeedbackLessonsRail } from "./FeedbackLessonsRail";
import { XIcon } from "./icons";
import { Modal } from "./ui/Modal";
import { BTN_PRIMARY } from "./ui/buttons";
import { newDiscussionUrl, newIssueUrl } from "../githubIssue";
import { feedbackTitle, guessFeedbackKind, type FeedbackKind } from "./feedbackDraft";

interface KindOption {
  value: FeedbackKind;
  title: string;
  target: "issue" | "discussion";
  hint: string;
  url: (title: string, body: string) => string;
}

// Bugs are work to track, so they become issues; ideas and questions are a
// conversation others can join, upvote or answer, so they become discussions.
const KINDS: KindOption[] = [
  {
    value: "bug",
    title: "Bug",
    target: "issue",
    hint: "Bugs open a GitHub issue, where the fix is tracked",
    url: (title, body) => newIssueUrl({ title, body, labels: ["bug"] }),
  },
  {
    value: "suggestion",
    title: "Idea",
    target: "discussion",
    hint: "Ideas start a GitHub discussion others can upvote",
    url: (title, body) => newDiscussionUrl({ title, body, category: "ideas" }),
  },
  {
    value: "question",
    title: "Question",
    target: "discussion",
    hint: "Questions start a Q&A discussion anyone can answer",
    url: (title, body) => newDiscussionUrl({ title, body, category: "q-a" }),
  },
];

const SUBMIT_LABEL = { issue: "Open GitHub issue", discussion: "Start GitHub discussion" };

export function FeedbackModal() {
  const open = useAppStore((state) => state.feedbackOpen);
  const setFeedbackOpen = useAppStore((state) => state.setFeedbackOpen);
  const [text, setText] = useState("");
  // The user's own pick; until there is one, the kind follows the text.
  const [picked, setPicked] = useState<FeedbackKind | null>(null);
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState("");

  const onClose = () => setFeedbackOpen(false);

  useEffect(() => {
    if (!open) {
      setText("");
      setPicked(null);
      return;
    }
    GetVersion().then(setVersion).catch(() => setVersion(""));
    GetPlatform().then(setPlatform).catch(() => setPlatform(""));
  }, [open]);

  const kind = picked ?? guessFeedbackKind(text);
  const option = KINDS.find((candidate) => candidate.value === kind);
  const title = feedbackTitle(text);
  const isValid = !!option && title.length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    const footer = `\n\n---\nlpm ${version || "dev"} · ${platform || navigator.platform}`;
    BrowserOpenURL(option.url(title, text.trim() + footer));
    onClose();
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="w-[min(860px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex max-h-[min(720px,calc(100vh-48px))] flex-col">
        <header className="flex shrink-0 items-start gap-4 border-b border-[var(--border)] py-4 pl-6 pr-4">
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-[17px] font-semibold tracking-tight text-[var(--text-primary)]">
              Send feedback
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
              Share a bug, idea, or question with the lpm team. It opens on GitHub, ready to post.
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
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          onKeyDown={handleFormKeyDown}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
            <div className="flex-1 px-6 py-5 md:w-[560px] md:shrink-0">
              <label
                htmlFor="feedback-text"
                className="mb-2 block text-[12px] font-medium text-[var(--text-secondary)]"
              >
                What's on your mind?
              </label>
              <textarea
                id="feedback-text"
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="What happened, what you'd like, or what you want to know…"
                rows={6}
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-[13px] leading-relaxed text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--text-secondary)] md:h-[216px]"
              />

              <FeedbackKindPicker
                choices={KINDS}
                value={kind}
                guessed={picked === null}
                onPick={setPicked}
              />

              <p className="mt-3 h-[18px] truncate text-[12px] text-[var(--text-muted)]">
                {title && (
                  <>
                    Title: <span className="text-[var(--text-secondary)]">{title}</span>
                  </>
                )}
              </p>
            </div>
            <FeedbackLessonsRail />
          </div>

          <div className="flex min-h-[60px] shrink-0 items-center justify-between gap-4 border-t border-[var(--border)] px-6 py-3">
            <p className="flex items-center gap-1.5 text-[12px] leading-snug text-[var(--text-muted)]">
              {option?.target === "issue" && <CircleDot size={13} strokeWidth={2} className="shrink-0" />}
              {option?.target === "discussion" && (
                <MessagesSquare size={13} strokeWidth={2} className="shrink-0" />
              )}
              {option?.hint ?? "Write what's on your mind to continue."}
            </p>
            <button
              type="submit"
              disabled={!isValid}
              className={`${BTN_PRIMARY} flex shrink-0 items-center gap-1.5`}
            >
              {option ? SUBMIT_LABEL[option.target] : "Open on GitHub"}
              <ExternalLink size={12} strokeWidth={2} />
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
