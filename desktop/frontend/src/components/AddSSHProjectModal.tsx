import { useEffect, useState } from "react";
import { Modal } from "./ui/Modal";
import { CheckIcon, ChevronDownIcon, ServerIcon, XIcon } from "./icons";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { slugify } from "../slugify";
import { ListSSHHosts } from "../../wailsjs/go/main/App";
import type { main } from "../../wailsjs/go/models";

const MANUAL_PICKER = "__manual__";

interface AddSSHProjectModalProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCreate: (params: {
    name: string;
    host: string;
    user: string;
    port: number;
    key: string;
    dir: string;
  }) => Promise<void> | void;
}

export function AddSSHProjectModal({
  open,
  busy,
  onClose,
  onCreate,
}: AddSSHProjectModalProps) {
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [port, setPort] = useState("");
  const [key, setKey] = useState("");
  const [dir, setDir] = useState("");
  const [sshHosts, setSshHosts] = useState<main.SSHConfigHost[]>([]);
  const [picker, setPicker] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useOutsideClick<HTMLDivElement>(
    () => setPickerOpen(false),
    pickerOpen,
  );

  useEffect(() => {
    if (!open) return;
    setName("");
    setNameTouched(false);
    setHost("");
    setUser("");
    setPort("");
    setKey("");
    setDir("");
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
  }, [open]);

  const onPickerChange = (val: string) => {
    setPicker(val);
    if (val === "" || val === MANUAL_PICKER) {
      setHost("");
      setUser("");
      setPort("");
      setKey("");
      return;
    }
    const match = sshHosts.find((h) => h.name === val);
    if (!match) return;
    // Save the Host alias, not HostName, so OpenSSH still applies alias-scoped
    // options such as ProxyJump, ProxyCommand, and canonical HostName.
    setHost(match.name);
    setUser(match.user);
    setPort(match.port && match.port > 0 ? String(match.port) : "");
    setKey(match.identityFile);
  };

  // Fields stay hidden until the user picks an option from the SSH config
  // dropdown. With no config file at all, there's no picker — show fields
  // directly.
  const showFields = sshHosts.length === 0 || picker !== "";

  const pickerMatch = sshHosts.find((h) => h.name === picker);
  const pickerLabel =
    picker === MANUAL_PICKER
      ? "Enter manually…"
      : pickerMatch
        ? pickerMatch.user
          ? `${pickerMatch.name} — ${pickerMatch.user}`
          : pickerMatch.name
        : "";

  // If the user edits the Host field after picking a configured host, the
  // dropdown's "selected" label would silently lie about what they're
  // connecting to. Switch the picker to manual mode so the UI matches the
  // form state.
  const onHostInput = (v: string) => {
    setHost(v);
    if (picker !== "" && picker !== MANUAL_PICKER) {
      const expected = pickerMatch
        ? pickerMatch.hostName || pickerMatch.name
        : "";
      if (v !== expected) setPicker(MANUAL_PICKER);
    }
  };

  const choosePickerOption = (val: string) => {
    onPickerChange(val);
    setPickerOpen(false);
  };

  useEffect(() => {
    if (nameTouched) return;
    const u = user.trim();
    // When a configured host is picked, prefer the alias for the name slug —
    // `host` may be a raw IP from the `HostName` directive.
    const h = (pickerMatch ? pickerMatch.name : host).trim();
    if (!u && !h) return;
    const suggested = slugify(u && h ? `${u}-${h}` : u || h);
    setName((prev) => (prev === suggested ? prev : suggested));
  }, [host, user, pickerMatch, nameTouched]);

  const portNum = port.trim() === "" ? 22 : Number(port);
  const portValid = Number.isFinite(portNum) && portNum >= 1 && portNum <= 65535;
  const finalName = slugify(name);
  const canCreate =
    !busy &&
    finalName.length > 0 &&
    host.trim().length > 0 &&
    user.trim().length > 0 &&
    portValid;

  const submit = async () => {
    if (!canCreate) return;
    await onCreate({
      name: finalName,
      host: host.trim(),
      user: user.trim(),
      port: portNum,
      key: key.trim(),
      dir: dir.trim(),
    });
  };

  const inputClass =
    "w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--text-muted)] disabled:opacity-60";
  const textInputProps = {
    className: inputClass,
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    disabled: busy,
  } as const;

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
                  className={`${inputClass} flex items-center justify-between text-left ${pickerOpen ? "border-[var(--text-muted)]" : ""}`}
                >
                  <span
                    className={
                      pickerLabel ? "" : "text-[var(--text-muted)]"
                    }
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
                  value={host}
                  onChange={(e) => onHostInput(e.target.value)}
                  placeholder="example.com or 10.0.0.5"
                  {...textInputProps}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  User
                </label>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="root"
                  {...textInputProps}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Port
                </label>
                <input
                  value={port}
                  onChange={(e) =>
                    setPort(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  placeholder="22"
                  inputMode="numeric"
                  className={inputClass}
                  disabled={busy}
                />
              </div>

              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                  Identity file{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    (optional)
                  </span>
                </label>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
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
                  value={dir}
                  onChange={(e) => setDir(e.target.value)}
                  placeholder="/var/www/app"
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
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  placeholder="my-server"
                  {...textInputProps}
                />
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
            disabled={!canCreate}
            className="rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Creating…" : "Add project"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
