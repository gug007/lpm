import { useEffect, useRef, useState } from "react";
import { GitPullRequest, Sparkles, ArrowRight } from "lucide-react";
import { Modal } from "./ui/Modal";
import { XIcon, BranchIcon } from "./icons";
import { BrowserOpenURL } from "../../bridge/runtime";
import {
  remoteGitSummary,
  remoteGitGenPr,
  remoteGitCreatePr,
} from "./review/remoteReviewSource";
import { toast } from "../toast";

// The remote PR flow, modeled on the local PRModal but backed by the two frames
// the peer protocol exposes: `gitGenPr` (AI-draft title + body, run against the
// peer's default branch) and `gitCreatePr`. Unlike the local modal there is no
// base-branch picker or commit list — the protocol computes the base on the
// peer and carries no per-branch commit log — and a single "Draft with AI"
// button fills both fields, since gitGenPr returns them together.
export function RemotePRModal({
  open,
  peerId,
  project,
  onClose,
  onCreated,
}: {
  open: boolean;
  peerId: string;
  project: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currentBranch, setCurrentBranch] = useState("");
  const [defaultBranch, setDefaultBranch] = useState("");
  const [ghAvailable, setGhAvailable] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prURL, setPrURL] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTitle("");
    setDescription("");
    setPrURL("");
    void remoteGitSummary(peerId, project)
      .then((s) => {
        if (cancelled) return;
        setCurrentBranch(s.branch);
        setDefaultBranch(s.defaultBranch);
        setGhAvailable(s.ghCli);
        setTimeout(() => titleRef.current?.focus(), 50);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, peerId, project]);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [title]);

  const draft = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const { title: t, body } = await remoteGitGenPr(peerId, project);
      if (t) setTitle(t);
      if (body) setDescription(body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft the PR.");
    } finally {
      setGenerating(false);
    }
  };

  const canCreate =
    !busy && !generating && title.trim().length > 0 && ghAvailable;

  const submit = async () => {
    if (!canCreate) return;
    setBusy(true);
    try {
      const url = await remoteGitCreatePr(
        peerId,
        project,
        title.trim(),
        description.trim(),
      );
      setPrURL(url);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the PR.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdrop={false}
      draggable
      closeOnEscape={!busy && !generating}
      zIndexClassName="z-[60]"
      contentClassName="w-[640px] max-h-[80vh] flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        data-modal-drag-handle
        className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-1 ring-inset ring-[var(--accent-cyan)]/20">
          <GitPullRequest size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-tight text-[var(--text-primary)]">
            Create Pull Request
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
            Open a pull request on the other Mac to merge your changes on GitHub.
          </p>
        </div>
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
        {!ghAvailable && (
          <div className="rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/5 px-3 py-2 text-xs text-[var(--accent-red-text)]">
            GitHub CLI (gh) not found on the other Mac. Install it from{" "}
            <span className="font-medium">https://cli.github.com</span> and run{" "}
            <code className="rounded bg-[var(--bg-hover)] px-1">
              gh auth login
            </code>
          </div>
        )}

        {prURL ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-green)]/10">
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent-green)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-base font-medium text-[var(--text-primary)]">
                Pull request created
              </span>
              {defaultBranch && (
                <span className="text-xs text-[var(--text-muted)]">
                  {currentBranch} &rarr; {defaultBranch}
                </span>
              )}
            </div>
            <button
              onClick={() => BrowserOpenURL(prURL)}
              className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90"
            >
              Open on GitHub
            </button>
          </div>
        ) : (
          <>
            {(currentBranch || defaultBranch) && (
              <div className="flex items-center gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)]">
                  <BranchIcon size={11} />
                  <span className="max-w-[180px] truncate">
                    {currentBranch || "…"}
                  </span>
                </span>
                <ArrowRight
                  size={14}
                  className="shrink-0 text-[var(--text-muted)]"
                />
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)]">
                  <BranchIcon size={11} />
                  <span className="max-w-[180px] truncate">
                    {defaultBranch || "…"}
                  </span>
                </span>
              </div>
            )}

            <div
              className={`relative rounded-xl transition-all ${
                generating
                  ? "p-[1px] [background:conic-gradient(from_var(--gradient-angle),#6366f1,#a855f7,#ec4899,#06b6d4,#6366f1)] animate-[gradient-spin_3s_linear_infinite]"
                  : "border border-[var(--border)] focus-within:border-[var(--text-muted)]/60"
              }`}
            >
              <div className="flex flex-col rounded-[calc(0.75rem-1px)] bg-[var(--bg-secondary)]">
                <textarea
                  ref={titleRef}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="PR title"
                  disabled={busy}
                  rows={1}
                  style={{ maxHeight: "calc(3 * 1.4em + 0.5rem)" }}
                  aria-label="Pull request title"
                  className="w-full resize-none overflow-hidden bg-transparent px-3.5 pt-3 pb-2 text-base font-semibold leading-[1.4] text-[var(--text-primary)] outline-none placeholder:font-normal placeholder:text-[var(--text-muted)] disabled:opacity-60"
                />
                <div className="mx-3.5 border-t border-[var(--border)]/70" />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                  placeholder="Leave a description..."
                  disabled={busy}
                  rows={12}
                  style={{ maxHeight: "50vh" }}
                  aria-label="Pull request description"
                  className="w-full resize-none bg-transparent px-3.5 pb-1.5 pt-2.5 text-sm leading-[1.6] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
                />
                <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
                  <button
                    onClick={draft}
                    disabled={generating || busy}
                    title="Draft the title and description with AI on the other Mac"
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    <Sparkles size={13} />
                    {generating ? "Drafting…" : "Draft with AI"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-lg px-3.5 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
        >
          {prURL ? "Close" : "Cancel"}
        </button>
        {!prURL && (
          <button
            onClick={submit}
            disabled={!canCreate}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
          >
            {busy ? "Creating..." : "Create PR"}
          </button>
        )}
      </div>
    </Modal>
  );
}
