import { ChevronDownIcon, PlayIcon } from "../icons";
import type { ProfileInfo, ServiceInfo } from "../../types";

export interface PreviewService {
  service: ServiceInfo;
  isDraft: boolean;
}

export interface PreviewProfile {
  profile: ProfileInfo;
  isDraft: boolean;
}

interface StartMenuPreviewProps {
  services: PreviewService[];
  profiles: PreviewProfile[];
  // Optional caption shown below the menu — typically explains which entry
  // is highlighted ("draft entry" / "your edit").
  caption?: string;
  // Width of the right-side aside container (Tailwind class fragment).
  asideWidthClass?: string;
  // Click handlers swap the modal's editing target. Only fired for
  // non-draft rows; clicking the draft is a no-op.
  onPickService?: (service: ServiceInfo) => void;
  onPickProfile?: (profile: ProfileInfo) => void;
}

// StartMenuPreview renders the actual Start split-button with its dropdown
// menu open underneath, showing both Profiles and Services sections. Used
// by ServiceForm and ProfileForm as a WYSIWYG sidebar — clicking a non-draft
// row swaps the modal to that entry.
export function StartMenuPreview({
  services,
  profiles,
  caption = "Click any other entry to switch to editing it.",
  asideWidthClass = "lg:w-[340px]",
  onPickService,
  onPickProfile,
}: StartMenuPreviewProps) {
  const hasProfilesSection = profiles.length > 0;
  return (
    <aside
      className={`flex flex-col border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-6 lg:shrink-0 lg:border-l lg:border-t-0 ${asideWidthClass}`}
    >
      <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        Preview
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="inline-flex">
          <span className="rounded-l-lg bg-[var(--text-primary)] px-3.5 py-1.5 text-xs font-medium text-[var(--bg-primary)]">
            Start
          </span>
          <span className="flex items-center rounded-r-lg border-l border-[var(--bg-primary)]/20 bg-[var(--text-primary)] px-1.5 py-1.5 text-[var(--bg-primary)]">
            <ChevronDownIcon />
          </span>
        </div>
        <div className="max-h-[420px] w-full overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl">
          {hasProfilesSection && (
            <div className="pt-2 pb-1.5">
              <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Profiles
              </div>
              {profiles.map(({ profile, isDraft }, i) => (
                <PreviewProfileRow
                  key={`${profile.name}-${i}`}
                  profile={profile}
                  isDraft={isDraft}
                  onClick={!isDraft && onPickProfile ? () => onPickProfile(profile) : undefined}
                />
              ))}
            </div>
          )}
          {hasProfilesSection && <div className="mx-4 border-t border-[var(--border)]" />}
          <div className="pt-2 pb-1.5">
            <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              Services
            </div>
            {services.map(({ service, isDraft }, i) => (
              <PreviewServiceRow
                key={`${service.name}-${i}`}
                service={service}
                isDraft={isDraft}
                onClick={!isDraft && onPickService ? () => onPickService(service) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 text-[11px] leading-5 text-[var(--text-muted)]">{caption}</div>
    </aside>
  );
}

function PreviewServiceRow({
  service,
  isDraft,
  onClick,
}: {
  service: ServiceInfo;
  isDraft: boolean;
  onClick?: () => void;
}) {
  const draftStyle = isDraft
    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
    : "text-[var(--text-secondary)]";
  const interactive = onClick
    ? "cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] transition-colors ${draftStyle} ${interactive} disabled:cursor-default`}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center" />
      {service.name ? (
        <span className="flex-1 truncate font-mono">{service.name}</span>
      ) : (
        <span className="flex-1">
          <span className="inline-block h-3 w-20 rounded bg-[var(--border)]" />
        </span>
      )}
      {service.port > 0 && (
        <span className="text-[11px] text-[var(--text-muted)] tabular-nums">:{service.port}</span>
      )}
      <span className="text-[var(--text-muted)] opacity-60">
        <PlayIcon />
      </span>
    </button>
  );
}

function PreviewProfileRow({
  profile,
  isDraft,
  onClick,
}: {
  profile: ProfileInfo;
  isDraft: boolean;
  onClick?: () => void;
}) {
  const subline = profile.services.join(" · ");
  const draftStyle = isDraft
    ? "bg-[var(--bg-active)] text-[var(--text-primary)]"
    : "text-[var(--text-secondary)]";
  const interactive = onClick
    ? "cursor-pointer hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors ${draftStyle} ${interactive} disabled:cursor-default`}
    >
      <span className="mt-[6px] flex h-3.5 w-3.5 shrink-0 items-center justify-center" />
      <span className="flex min-w-0 flex-1 flex-col">
        {profile.name ? (
          <span className="truncate text-[13px]">{profile.name}</span>
        ) : (
          <span className="inline-block h-3 w-24 rounded bg-[var(--border)]" />
        )}
        {subline ? (
          <span className="truncate text-[11px] text-[var(--text-muted)] font-mono">{subline}</span>
        ) : (
          <span className="mt-1 inline-block h-2 w-32 rounded bg-[var(--border)] opacity-60" />
        )}
      </span>
      <span className="mt-[6px] text-[var(--text-muted)] opacity-60">
        <PlayIcon />
      </span>
    </button>
  );
}
