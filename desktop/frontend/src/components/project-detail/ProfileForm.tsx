import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { appendProfile, renameProfile, replaceProfile } from "../../profileConfig";
import { slugify } from "../../slugify";
import { uniqueKey } from "../../uniqueKey";
import type { ProfileInfo, ServiceInfo } from "../../types";
import { CheckIcon, XIcon } from "../icons";
import { Modal } from "../ui/Modal";
import { StartMenuPreview } from "./StartMenuPreview";

const FALLBACK_KEY = "new-profile";

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--text-primary)] focus:bg-[var(--bg-primary)]";

interface ProfileFormProps {
  open: boolean;
  projectName: string;
  // All services available in this project — checklist source and preview list.
  services: ServiceInfo[];
  // All current profiles — used to render a realistic preview and to avoid
  // YAML key collisions on create.
  profiles: ProfileInfo[];
  // When set, prefill from this profile and patch its YAML key in place.
  editing?: ProfileInfo | null;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
  // Click on a non-draft preview row swaps the modal to that entry. Service
  // clicks cross-route to the ServiceForm; profile clicks switch the profile
  // being edited.
  onPickService?: (service: ServiceInfo) => void;
  onPickProfile?: (profile: ProfileInfo) => void;
}

export function ProfileForm({
  open,
  projectName,
  services,
  profiles,
  editing,
  onClose,
  onSaved,
  onDelete,
  onPickService,
  onPickProfile,
}: ProfileFormProps) {
  const isEditing = Boolean(editing);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setPicked(new Set(editing.services));
    } else {
      setName("");
      setPicked(new Set());
    }
    setSaving(false);
    const focusTimer = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [open, editing]);

  const trimmedName = name.trim();

  // Names of all profiles *other than* the one currently being edited. Used
  // to guard against collisions when creating or renaming.
  const otherProfileKeys = useMemo(
    () => profiles.filter((p) => !editing || p.name !== editing.name).map((p) => p.name),
    [profiles, editing],
  );

  const desiredKey = useMemo(() => {
    const slug = slugify(trimmedName);
    if (editing) return slug || editing.name;
    return uniqueKey(slug || FALLBACK_KEY, profiles.map((p) => p.name));
  }, [editing, profiles, trimmedName]);

  const renameCollision = isEditing && otherProfileKeys.includes(desiredKey);

  // Preserve service order for stable YAML diffs: emit picked services in
  // the same order they appear in the project's service list.
  const orderedPicked = useMemo(
    () => services.map((s) => s.name).filter((n) => picked.has(n)),
    [services, picked],
  );

  const errorHint = !trimmedName
    ? "Name is required"
    : picked.size === 0
      ? "Pick at least one service"
      : renameCollision
        ? `A profile named "${desiredKey}" already exists`
        : "";

  const canSave = !errorHint && !saving;

  const previewProfileEntries = useMemo(() => {
    const others = profiles.filter((p) => !editing || p.name !== editing.name);
    const draft: ProfileInfo = { name: desiredKey, services: orderedPicked };
    const list = [...others, draft];
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list.map((p) => ({ profile: p, isDraft: p === draft }));
  }, [profiles, editing, desiredKey, orderedPicked]);

  const previewServiceEntries = useMemo(
    () => services.map((s) => ({ service: s, isDraft: false })),
    [services],
  );

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (editing) {
        await renameProfile(projectName, editing.name, desiredKey);
        await replaceProfile(projectName, desiredKey, orderedPicked);
        toast.success("Profile updated");
      } else {
        await appendProfile(projectName, desiredKey, orderedPicked);
        toast.success("Profile created");
      }
      onSaved();
      onClose();
    } catch (err) {
      const fallback = editing ? "Could not update profile" : "Could not create profile";
      toast.error(err instanceof Error ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const toggle = (svcName: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(svcName)) next.delete(svcName);
      else next.add(svcName);
      return next;
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      backdropClassName="bg-black/50 backdrop-blur-sm"
      contentClassName="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div
        className="flex max-h-[88vh] w-[min(800px,calc(100vw-32px))] flex-col"
        onKeyDown={onKeyDown}
      >
        <header className="flex items-start justify-between gap-4 px-8 pb-6 pt-7">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
              {isEditing ? "Edit profile" : "Add profile"}
            </h2>
            <p className="mt-2 max-w-[520px] text-[13px] leading-5 text-[var(--text-secondary)]">
              A profile is a named bundle of services to start together — for example, a
              minimal "frontend-only" set for design work.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <XIcon />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="space-y-5">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[var(--text-primary)]">
                  Name
                </span>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="frontend-only"
                  className={inputClass}
                />
                <span className="mt-1.5 block text-[11px] text-[var(--text-muted)]">
                  Click this name in the start menu to launch the bundle.
                </span>
              </label>

              <ServiceChecklist services={services} picked={picked} onToggle={toggle} />
            </div>
          </div>

          <StartMenuPreview
            services={previewServiceEntries}
            profiles={previewProfileEntries}
            asideWidthClass="lg:w-[320px]"
            onPickService={onPickService}
            onPickProfile={onPickProfile}
          />
        </div>

        <footer className="flex items-center gap-3 border-t border-[var(--border)] px-8 py-4">
          {isEditing && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--accent-red)] transition-colors hover:bg-[var(--accent-red)]/10"
            >
              Delete profile
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {!canSave && errorHint && (
              <span className="hidden text-[12px] text-[var(--text-muted)] sm:inline">
                {errorHint}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSave}
              className="rounded-xl bg-[var(--text-primary)] px-5 py-2.5 text-[13px] font-semibold text-[var(--bg-primary)] shadow-sm transition hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
            >
              {saving ? "Saving..." : isEditing ? "Save changes" : "Add profile"}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function ServiceChecklist({
  services,
  picked,
  onToggle,
}: {
  services: ServiceInfo[];
  picked: Set<string>;
  onToggle: (name: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-[var(--text-primary)]">Services</span>
        <span className="text-[11px] text-[var(--text-muted)]">
          {picked.size} of {services.length} selected
        </span>
      </div>
      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-[12px] text-[var(--text-muted)]">
          No services in this project yet. Add one first, then come back.
        </div>
      ) : (
        <div className="space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
          {services.map((service) => (
            <ServiceChecklistRow
              key={service.name}
              service={service}
              checked={picked.has(service.name)}
              onClick={() => onToggle(service.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceChecklistRow({
  service,
  checked,
  onClick,
}: {
  service: ServiceInfo;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] transition-colors hover:bg-[var(--bg-hover)] ${
        checked
          ? "bg-[var(--bg-primary)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)]"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          checked
            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
            : "border-[var(--border)]"
        }`}
      >
        {checked && <CheckIcon />}
      </span>
      <span className="flex-1 truncate font-mono">{service.name}</span>
      {service.port > 0 && (
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
          :{service.port}
        </span>
      )}
    </button>
  );
}
