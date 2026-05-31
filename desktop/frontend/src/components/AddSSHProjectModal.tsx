import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "./ui/Modal";
import { CheckIcon, ChevronDownIcon, ServerIcon, XIcon } from "./icons";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { slugify } from "../slugify";
import { useAppStore } from "../store/app";
import { ListSSHHosts } from "../../bridge/commands";
import type { main } from "../../bridge/models";
import {
  portInputSchema,
  projectNameSchema,
  sshHostSchema,
  sshUserSchema,
} from "../forms/schemas";
import {
  modalErrorInputClass,
  modalInputClass,
  modalInputDefaults,
} from "../forms/styles";

const MANUAL_PICKER = "__manual__";

const schema = z.object({
  name: projectNameSchema,
  host: sshHostSchema,
  user: sshUserSchema,
  port: portInputSchema,
  key: z.string().trim(),
  dir: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  name: "",
  host: "",
  user: "",
  port: "",
  key: "",
  dir: "",
};

export function AddSSHProjectModal() {
  const open = useAppStore((s) => s.sshModalOpen);
  const busy = useAppStore((s) => s.addingSSHProject);
  const onClose = useAppStore((s) => s.closeSSHModal);
  const onCreate = useAppStore((s) => s.addSSHProject);

  const [sshHosts, setSshHosts] = useState<main.SSHConfigHost[]>([]);
  const [picker, setPicker] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useOutsideClick<HTMLDivElement>(
    () => setPickerOpen(false),
    pickerOpen,
  );

  const {
    control,
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
    if (!open) return;
    reset(DEFAULT_VALUES);
    setPicker("");
    setPickerOpen(false);
    let cancelled = false;
    void ListSSHHosts()
      .then((hosts) => {
        if (!cancelled) setSshHosts(hosts ?? []);
      })
      .catch(() => {
        if (!cancelled) setSshHosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, reset]);

  const pickerMatch = sshHosts.find((h) => h.name === picker);
  const pickerLabel =
    picker === MANUAL_PICKER
      ? "Enter manually…"
      : pickerMatch
        ? pickerMatch.user
          ? `${pickerMatch.name} — ${pickerMatch.user}`
          : pickerMatch.name
        : "";

  const applyPicker = (val: string) => {
    setPicker(val);
    if (val === "" || val === MANUAL_PICKER) {
      setValue("host", "");
      setValue("user", "");
      setValue("port", "");
      setValue("key", "");
      return;
    }
    const match = sshHosts.find((h) => h.name === val);
    if (!match) return;
    // Save the Host alias, not HostName, so OpenSSH still applies alias-scoped
    // options such as ProxyJump, ProxyCommand, and canonical HostName.
    setValue("host", match.name);
    setValue("user", match.user);
    setValue(
      "port",
      match.port && match.port > 0 ? String(match.port) : "",
    );
    setValue("key", match.identityFile);
  };

  const choosePickerOption = (val: string) => {
    applyPicker(val);
    setPickerOpen(false);
  };

  const showFields = sshHosts.length === 0 || picker !== "";

  const host = watch("host");
  const user = watch("user");
  const nameDirty = !!dirtyFields.name;

  // If the user edits the Host field after picking a configured host, the
  // dropdown's "selected" label would silently lie about what they're
  // connecting to. Switch the picker to manual mode so the UI matches the
  // form state.
  useEffect(() => {
    if (picker === "" || picker === MANUAL_PICKER) return;
    const expected = pickerMatch
      ? pickerMatch.hostName || pickerMatch.name
      : "";
    if (host !== expected) setPicker(MANUAL_PICKER);
  }, [host, picker, pickerMatch]);

  useEffect(() => {
    if (nameDirty) return;
    const u = user.trim();
    // Prefer the alias for the slug — `host` may be a raw IP from `HostName`.
    const h = (pickerMatch ? pickerMatch.name : host).trim();
    if (!u && !h) return;
    const suggested = slugify(u && h ? `${u}-${h}` : u || h);
    setValue("name", suggested, { shouldDirty: false });
  }, [host, user, pickerMatch, nameDirty, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const portNum = values.port === "" ? 22 : Number(values.port);
    await onCreate({
      name: slugify(values.name),
      host: values.host,
      user: values.user,
      port: portNum,
      key: values.key,
      dir: values.dir,
    });
  });

  const textInputProps = { ...modalInputDefaults, disabled: busy } as const;

  const errorText = (msg: string) => (
    <p className="mt-1 text-[11px] text-[var(--danger,#f87171)]">{msg}</p>
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
            Connect to SSH host
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
          Creates a project that connects to a remote host. Services, actions,
          and terminals will run over this SSH connection.
        </p>

        <div className="mt-4 grid grid-cols-[1fr_120px] gap-3">
          {sshHosts.length > 0 && (
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                Connect to Host…
              </label>
              <div ref={pickerRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPickerOpen((p) => !p)}
                  disabled={busy}
                  className={`${modalInputClass} flex items-center justify-between text-left ${pickerOpen ? "border-[var(--text-muted)]" : ""}`}
                >
                  <span
                    className={pickerLabel ? "" : "text-[var(--text-muted)]"}
                  >
                    {pickerLabel || "Select a host…"}
                  </span>
                  <span
                    className={`text-[var(--text-muted)] transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                  >
                    <ChevronDownIcon />
                  </span>
                </button>
                {pickerOpen && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
                    {sshHosts.map((h) => {
                      const selected = picker === h.name;
                      return (
                        <button
                          key={h.name}
                          type="button"
                          onClick={() => choosePickerOption(h.name)}
                          className={`group flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)] ${selected ? "bg-[var(--bg-hover)]" : ""}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-secondary)] text-[var(--text-muted)] group-hover:text-[var(--text-primary)]">
                            <ServerIcon />
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="text-[var(--text-primary)]">
                              {h.name}
                            </span>
                            {h.user && (
                              <span className="text-[var(--text-muted)]">
                                {" — "}
                                {h.user}
                              </span>
                            )}
                          </span>
                          {selected && (
                            <span className="text-[var(--text-primary)]">
                              <CheckIcon />
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <div className="my-1 border-t border-[var(--border)]" />
                    <button
                      type="button"
                      onClick={() => choosePickerOption(MANUAL_PICKER)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-hover)] ${picker === MANUAL_PICKER ? "bg-[var(--bg-hover)]" : ""}`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)]">
                        +
                      </span>
                      <span className="flex-1 text-[var(--text-secondary)]">
                        Enter manually…
                      </span>
                      {picker === MANUAL_PICKER && (
                        <span className="text-[var(--text-primary)]">
                          <CheckIcon />
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {showFields && (
            <>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Host
                </label>
                <input
                  autoFocus
                  placeholder="example.com or 10.0.0.5"
                  aria-invalid={!!errors.host}
                  className={`${modalInputClass} ${errors.host ? modalErrorInputClass : ""}`}
                  {...register("host")}
                  {...textInputProps}
                />
                {errors.host && errorText(errors.host.message ?? "")}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  User
                </label>
                <input
                  placeholder="root"
                  aria-invalid={!!errors.user}
                  className={`${modalInputClass} ${errors.user ? modalErrorInputClass : ""}`}
                  {...register("user")}
                  {...textInputProps}
                />
                {errors.user && errorText(errors.user.message ?? "")}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Port
                </label>
                <Controller
                  control={control}
                  name="port"
                  render={({ field }) => (
                    <input
                      ref={field.ref}
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value.replace(/[^0-9]/g, ""),
                        )
                      }
                      placeholder="22"
                      inputMode="numeric"
                      aria-invalid={!!errors.port}
                      className={`${modalInputClass} ${errors.port ? modalErrorInputClass : ""}`}
                      disabled={busy}
                    />
                  )}
                />
                {errors.port && errorText(errors.port.message ?? "")}
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Identity file{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    (optional)
                  </span>
                </label>
                <input
                  placeholder="~/.ssh/id_ed25519"
                  className={modalInputClass}
                  {...register("key")}
                  {...textInputProps}
                />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  Leave blank to use ssh-agent or your ~/.ssh/config defaults.
                </p>
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Remote directory{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    (optional)
                  </span>
                </label>
                <input
                  placeholder="/var/www/app"
                  className={modalInputClass}
                  {...register("dir")}
                  {...textInputProps}
                />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  The shell will land in this directory on the remote host.
                </p>
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Project name
                </label>
                <input
                  placeholder="my-server"
                  aria-invalid={!!errors.name}
                  className={`${modalInputClass} ${errors.name ? modalErrorInputClass : ""}`}
                  {...register("name")}
                  {...textInputProps}
                />
                {errors.name && errorText(errors.name.message ?? "")}
              </div>
            </>
          )}
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
            {busy ? "Creating…" : "Add project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
