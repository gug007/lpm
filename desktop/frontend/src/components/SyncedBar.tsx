import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PauseCircle, Play, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { followPause, followResume, followStop, type FollowState } from "../followApi";

// Relative time only needs to be roughly right, and the row re-renders on every
// real sync anyway; this keeps it honest in between.
const TICK_MS = 15_000;

interface SyncedBarProps {
  follow: FollowState;
  macName: string;
}

// One quiet row above a synced project: where it comes from, how current it is,
// and the only two controls it needs. Deliberately not a card — it sits under the
// header without competing with the terminal for attention.
export function SyncedBar({ follow, macName }: SyncedBarProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useTick(TICK_MS);

  const fail = (err: unknown) => toast.error(String(err));
  const paused = Boolean(follow.paused);
  // Paused by the user is resumable as-is; paused because their work is in the
  // way needs them to say what happens to that work.
  const blocked = paused && !follow.pausedByUser;

  return (
    <div className="mt-1 flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-1.5 text-[12px]">
      <span
        className={
          paused
            ? "shrink-0 text-[var(--accent-amber)]"
            : `shrink-0 text-[var(--text-muted)] ${follow.syncing ? "animate-spin" : ""}`
        }
      >
        {paused ? <PauseCircle size={13} /> : <RefreshCw size={13} />}
      </span>

      <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
        {paused ? (
          <>
            <span className="text-[var(--accent-amber)]">Sync paused</span>
            <Dot />
            {follow.paused}
          </>
        ) : (
          <>
            Synced from <span className="text-[var(--text-primary)]">{macName}</span>
            {follow.lastBranch && (
              <>
                <Dot />
                <span className="font-mono">{follow.lastBranch}</span>
              </>
            )}
            <Dot />
            {statusLabel(follow)}
          </>
        )}
      </span>

      {blocked && (
        <BarButton onClick={() => setConfirmDiscard(true)}>Discard mine</BarButton>
      )}
      {paused ? (
        <BarButton icon={<Play size={11} />} onClick={() => void followResume(follow.project, false).catch(fail)}>
          Resume
        </BarButton>
      ) : (
        <BarButton onClick={() => void followPause(follow.project).catch(fail)}>Pause</BarButton>
      )}
      <BarButton onClick={() => void followStop(follow.project).catch(fail)}>Stop</BarButton>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your changes here?"
        body={
          <>
            The edits in this folder that didn't come from {macName} will be replaced by
            its version. This cannot be undone.
          </>
        }
        confirmLabel="Discard and resume"
        variant="destructive"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          void followResume(follow.project, true).catch(fail);
        }}
      />
    </div>
  );
}

function BarButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[12px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    >
      {icon}
      {children}
    </button>
  );
}

function Dot() {
  return <span className="mx-1.5 text-[var(--text-muted)]">·</span>;
}

function statusLabel(follow: FollowState): string {
  if (follow.syncing) return "syncing now";
  if (follow.lastError) return follow.lastError;
  if (!follow.lastSyncedAt) return "waiting for the first change";
  return `${sinceLabel(follow.lastSyncedAt)}${follow.files ? ` · ${follow.files} files` : ""}`;
}

function sinceLabel(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function useTick(everyMs: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
}
