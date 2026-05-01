import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { slugify } from "../slugify";
import { useAppStore } from "../store/app";
import { BrowseFolder } from "../../wailsjs/go/main/App";
import { gitUrlSchema, projectNameSchema } from "../forms/schemas";
import {
  modalErrorInputClass,
  modalInputClass,
  modalInputDefaults,
} from "../forms/styles";

function deriveNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  let tail = trimmed.replace(/\/+$/, "").split(/[\/:]/).pop() ?? "";
  tail = tail.replace(/\.git$/i, "");
  return slugify(tail);
}

const schema = z.object({
  url: gitUrlSchema,
  branch: z.string().trim(),
  destParent: z.string().trim().min(1, "Pick a destination folder."),
  name: projectNameSchema,
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  url: "",
  branch: "",
  destParent: "",
  name: "",
};

export function AddCloneRepoModal() {
  const open = useAppStore((s) => s.cloneModalOpen);
  const onClose = useAppStore((s) => s.closeAddCloneModal);
  const busy = useAppStore((s) => s.addingCloneProject);
  const onCreate = useAppStore((s) => s.addCloneProject);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) return;
    reset(DEFAULT_VALUES);
    setShowAdvanced(false);
    setSubmitError("");
  }, [open, reset]);

  const url = watch("url");
  const nameDirty = !!dirtyFields.name;
  useEffect(() => {
    if (nameDirty) return;
    setValue("name", deriveNameFromUrl(url), { shouldDirty: false });
  }, [url, nameDirty, setValue]);

  const pickDest = async () => {
    if (busy) return;
    try {
      const dir = await BrowseFolder();
      if (dir) {
        setValue("destParent", dir, {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
    } catch {
      // BrowseFolder is the user's own picker; cancellations are normal.
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError("");
    try {
      await onCreate({
        name: slugify(values.name),
        url: values.url,
        branch: values.branch,
        destParent: values.destParent,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : String(err ?? "Clone failed");
      setSubmitError(msg);
    }
  });

  const textInputProps = { ...modalInputDefaults, disabled: busy } as const;

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
      <form onSubmit={onSubmit} noValidate>
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
              placeholder="https://github.com/owner/repo.git"
              aria-invalid={!!errors.url}
              className={`${modalInputClass} ${errors.url ? modalErrorInputClass : ""}`}
              {...register("url")}
              {...textInputProps}
            />
            {hintText("HTTPS or SSH URL. Uses your existing Git credentials.")}
            {errors.url && errorText(errors.url.message ?? "")}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Destination folder
            </label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                readOnly
                placeholder="Pick a parent folder…"
                aria-invalid={!!errors.destParent}
                className={`${modalInputClass} ${errors.destParent ? modalErrorInputClass : ""}`}
                onClick={pickDest}
                {...register("destParent")}
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
            {errors.destParent && errorText(errors.destParent.message ?? "")}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
              Project name
            </label>
            <input
              placeholder="my-repo"
              aria-invalid={!!errors.name}
              className={`${modalInputClass} ${errors.name ? modalErrorInputClass : ""}`}
              {...register("name")}
              {...textInputProps}
            />
            {errors.name && errorText(errors.name.message ?? "")}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              disabled={busy}
              aria-expanded={showAdvanced}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)] disabled:opacity-40"
            >
              <span
                className={`inline-block transition-transform ${showAdvanced ? "rotate-90" : ""}`}
              >
                ›
              </span>
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Branch{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    (optional)
                  </span>
                </label>
                <input
                  placeholder="main"
                  className={modalInputClass}
                  {...register("branch")}
                  {...textInputProps}
                />
                {hintText(
                  "Leave blank to use the repository's default branch.",
                )}
              </div>
            )}
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
            disabled={busy}
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
