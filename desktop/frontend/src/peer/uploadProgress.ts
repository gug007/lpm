// Progress for a file on its way to a peer Mac. The transport stamps every
// `peer-upload-progress` event with the token the caller minted, so one toast per
// upload can follow it and vanish the moment the upload settles either way.
import { toast } from "sonner";
import { PeerState } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { formatBytes } from "../syncApi";
import { peerAlias, type PeerStateShape } from "./usePeerState";

export interface UploadProgress {
  token: string;
  name: string;
  sent: number;
  total: number;
}

export interface UploadToast {
  title: string;
  description?: string;
}

// A transfer that lands sooner than this never shows a toast: its chip appears
// before anyone could have read one.
export const SHOW_AFTER_MS = 600;

export function uploadToast(
  name: string,
  alias: string,
  sent: number,
  total: number,
): UploadToast {
  const title = `Sending ${name} to ${alias}…`;
  if (total <= 0) return { title };
  return {
    title,
    description: `${formatBytes(sent)} of ${formatBytes(total)}`,
  };
}

interface Tracked {
  name: string;
  alias: string;
  progress: UploadProgress | null;
  shown: boolean;
  timer: ReturnType<typeof setTimeout>;
}

const inflight = new Map<string, Tracked>();
let subscribed = false;

function subscribe(): void {
  if (subscribed) return;
  subscribed = true;
  EventsOn("peer-upload-progress", (p: UploadProgress) => {
    const tracked = p?.token ? inflight.get(p.token) : undefined;
    if (!tracked) return;
    tracked.progress = p;
    if (tracked.shown) render(p.token, tracked);
  });
}

function render(token: string, tracked: Tracked): void {
  const { title, description } = uploadToast(
    tracked.name,
    tracked.alias,
    tracked.progress?.sent ?? 0,
    tracked.progress?.total ?? 0,
  );
  toast.loading(title, { id: token, description, duration: Infinity });
}

async function aliasFor(slug: string): Promise<string> {
  try {
    const state = (await PeerState()) as PeerStateShape | null;
    return peerAlias(state?.peers ?? [], slug);
  } catch {
    return peerAlias([], slug);
  }
}

export function trackPeerUpload<T>(
  token: string,
  slug: string,
  name: string,
  upload: Promise<T>,
): Promise<T> {
  subscribe();
  const tracked: Tracked = {
    name,
    alias: peerAlias([], slug),
    progress: null,
    shown: false,
    timer: setTimeout(() => {
      tracked.shown = true;
      render(token, tracked);
    }, SHOW_AFTER_MS),
  };
  inflight.set(token, tracked);
  void aliasFor(slug).then((alias) => {
    tracked.alias = alias;
    if (tracked.shown) render(token, tracked);
  });
  return upload.finally(() => {
    clearTimeout(tracked.timer);
    inflight.delete(token);
    if (tracked.shown) toast.dismiss(token);
  });
}
