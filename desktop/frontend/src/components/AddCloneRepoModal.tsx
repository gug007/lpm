import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { slugify } from "../slugify";
import { useAppStore } from "../store/app";
import { BrowseFolder } from "../../wailsjs/go/main/App";

function deriveNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  let tail = trimmed
    .replace(/\/+$/, "")
    .split(/[\/:]/)
    .pop() ?? "";
  tail = tail.replace(/\.git$/i, "");
  return slugify(tail);
}

export function AddCloneRepoModal() {
  const open = useAppStore((s) => s.cloneModalOpen);
  const onClose = useAppStore((s) => s.closeAddCloneModal);
  const busy = useAppStore((s) => s.addingCloneProject);
  const onCreate = useAppStore((s) => s.addCloneProject);

  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [destParent, setDestParent] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  const [urlBlurred, setUrlBlurred] = useState(false);
  const [destBlurred, setDestBlurred] = useState(false);
  const [nameBlurred, setNameBlurred] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (open) return;
    setUrl("");
    setBranch("");
    setDestParent("");
    setName("");
    setNameTouched(false);
    setUrlBlurred(false);
    setDestBlurred(false);
    setNameBlurred(false);
    setSubmitted(false);
    setSubmitError("");
  }, [open]);

  useEffect(() => {
    if (nameTouched) return;
    const suggested = deriveNameFromUrl(url);
    setName((prev) => (prev === suggested ? prev : suggested));
  }, [url, nameTouched]);

  const trimmedUrl = url.trim();
  const finalName = slugify(name);
  const trimmedDest = destParent.trim();

  const urlError = trimmedUrl.length === 0 ? "Enter a repository URL." : "";
  const destError =
    trimmedDest.length === 0 ? "Pick a destination folder." : "";
  const nameError =
    finalName.length === 0 ? "Enter a project name." : "";

  const showUrlError = (urlBlurred || submitted) && !!urlError;
  const showDestError = (destBlurred || submitted) && !!destError;
  const showNameError = (nameBlurred || submitted) && !!nameError;

  const canSubmit =
    !busy && !urlError && !destError && !nameError;

  const pickDest = async () => {
    if (busy) return;
    try {
      const dir = await BrowseFolder();
      if (dir) {
        setDestParent(dir);
        setDestBlurred(true);
      }
    } catch {
      // BrowseFolder is the user's own picker; cancellations are normal.
    }
  };

  const submit = async () => {
    setSubmitted(true);
    if (!canSubmit) return;
    setSubmitError("");
    try {
      await onCreate({
        name: finalName,
        url: trimmedUrl,
        branch: branch.trim(),
        destParent: trimmedDest,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err ?? "Clone failed");
      setSubmitError(msg);
    }
  };

  const inputClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)] disabled:opacity-60";
  const errorInputClass = "border-[var(--danger,#f87171)]";
  const textInputProps = {
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    disabled: busy,
  } as const;

  const errorText = (msg: string) => (
    <p className="mt-1 text-[11px] text-[var(--danger,#f87171)]">{msg}</p>
  );
  const hintText = (msg: string) => (
    <p className="mt-1 text-[11px] text-[var(--text-muted)]">{msg}</p>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      zIndexClassName="z-[60]"
      contentClassName="w-[460px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Clone repository
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <XIcon />
          </button>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
          Clones a Git repo into a folder on this machine and adds it as a
          project.
        </p>

        {submitError && (
          <div className="mt-4 rounded-md border border-[var(--danger,#f87171)]/40 bg-[var(--danger,#f87171)]/10 px-3 py-2 text-[12px] leading-relaxed text-[var(--danger,#f87171)]">
            Couldn't clone the repository. {submitError}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Repository URL
            </label>
            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => setUrlBlurred(true)}
              placeholder="https://github.com/owner/repo.git"
              className={`${inputClass} ${showUrlError ? errorInputClass : ""}`}
              {...textInputProps}
            />
            {hintText("HTTPS or SSH URL. Uses your existing Git credentials.")}
            {showUrlError && errorText(urlError)}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Branch{" "}
              <span className="font-normal text-[var(--text-muted)]">
                (optional)
              </span>
            </label>
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              className={inputClass}
              {...textInputProps}
            />
            {hintText("Leave blank to use the repository's default branch.")}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Destination folder
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                readOnly
                value={destParent}
                placeholder="Pick a parent folder…"
                className={`${inputClass} ${showDestError ? errorInputClass : ""}`}
                onClick={pickDest}
                {...textInputProps}
              />
              <button
                type="button"
                onClick={pickDest}
                disabled={busy}
                className="shrink-0 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                Choose…
              </button>
            </div>
            {hintText("Repository will be cloned into a new subfolder here.")}
            {showDestError && errorText(destError)}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Project name
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameTouched(true);
              }}
              onBlur={() => setNameBlurred(true)}
              placeholder="my-repo"
              className={`${inputClass} ${showNameError ? errorInputClass : ""}`}
              {...textInputProps}
            />
            {showNameError && errorText(nameError)}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Cloning…" : "Clone repository"}
          </button>
        </div>

        {busy && (
          <p className="mt-2 text-right text-[11px] text-[var(--text-muted)]">
            This may take a moment for large repositories.
          </p>
        )}
      </form>
    </Modal>
  );
}

