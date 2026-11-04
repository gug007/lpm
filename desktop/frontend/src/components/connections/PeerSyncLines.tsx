import { RefreshCw } from "lucide-react";
import { PeerSetAutoSync } from "../../../bridge/commands";
import type { PeerClient } from "../../peer/usePeerState";
import {
  autoSyncHint,
  canSyncNow,
  lastSyncedText,
  skippedSkillsText,
  syncPill,
  type SyncDiff,
} from "../../peer/usePeerSync";
import { DetailLine } from "./DetailLine";
import { Toggle } from "./Toggle";
import { SECONDARY_BUTTON } from "../mobile/styles";

// Config sync with one computer, inside its opened row.
export function PeerSyncLines({
  peer,
  diff,
  busy,
  onSyncNow,
}: {
  peer: PeerClient;
  diff: SyncDiff | undefined;
  busy: string | null;
  onSyncNow: () => void;
}) {
  const pill = syncPill(peer, diff);
  const hint = autoSyncHint(peer);
  const skipped = skippedSkillsText(diff?.skippedSkills);

  return (
    <>
      <DetailLine
        title="Config sync"
        subtitle={
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              title={pill.title}
              className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium"
              style={{ color: pill.color, backgroundColor: `color-mix(in srgb, ${pill.color} 14%, transparent)` }}
            >
              {pill.text}
            </span>
            <span className="truncate">{lastSyncedText(peer)}</span>
          </span>
        }
      >
        <button
          type="button"
          onClick={onSyncNow}
          disabled={!canSyncNow(peer, diff, busy)}
          className={SECONDARY_BUTTON}
        >
          <RefreshCw size={12} className={busy === peer.slug ? "animate-spin" : ""} />
          Sync now
        </button>
      </DetailLine>
      {skipped && <DetailLine title="Skills not synced" subtitle={skipped} />}
      <DetailLine
        title="Keep config in sync automatically"
        subtitle={
          hint ??
          "Changes on either side sync shortly after they happen. The newer change wins, and a backup is kept."
        }
      >
        <Toggle
          enabled={!!peer.autoSync}
          ariaLabel={`Keep config in sync with ${peer.alias || peer.host} automatically`}
          onChange={(v) => void PeerSetAutoSync(peer.slug, v)}
        />
      </DetailLine>
    </>
  );
}
