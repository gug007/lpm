// Progress for a file on its way to or from a peer Mac. The transport stamps
// every `peer-upload-progress` / `peer-download-progress` event with the token
// the caller minted (a download's is the file's path), so one toast per transfer
// can follow it and vanish the moment the transfer settles either way.
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

function transferToast(title: string, sent: number, total: number): UploadToast {
  if (total <= 0) return { title };
  return {
    title,
    description: `${formatBytes(sent)} of ${formatBytes(total)}`,
  };
}

export function uploadToast(
  name: string,
  alias: string,
  sent: number,
  total: number,
): UploadToast {
  return transferToast(`Sending ${name} to ${alias}…`, sent, total);
}

export function downloadToast(
  name: string,
  alias: string,
  received: number,
  total: number,
): UploadToast {
  return transferToast(`Bringing ${name} from ${alias}…`, received, total);
}

interface Tracked {
  name: string;
  alias: string;
  describe: typeof uploadToast;
  progress: UploadProgress | null;
  // A download can turn out not to be one (the editor reached the file over
  // SSH), so its toast waits for the first bytes as well as the delay.
  waitsForBytes: boolean;
  due: boolean;
  shown: boolean;
  timer: ReturnType<typeof setTimeout>;
}

const inflight = new Map<string, Tracked>();
let subscribed = false;

function subscribe(): void {
  if (subscribed) return;
  subscribed = true;
  const onProgress = (p: UploadProgress) => {
    const tracked = p?.token ? inflight.get(p.token) : undefined;
    if (!tracked) return;
    tracked.progress = p;
    show(p.token, tracked);
  };
  EventsOn("peer-upload-progress", onProgress);
  EventsOn("peer-download-progress", onProgress);
}

function show(token: string, tracked: Tracked): void {
  if (!tracked.due || (tracked.waitsForBytes && !tracked.progress)) return;
  tracked.shown = true;
  render(token, tracked);
}

function render(token: string, tracked: Tracked): void {
  const { title, description } = tracked.describe(
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
  return track(token, slug, name, uploadToast, false, upload);
}

// `token` is the paired machine's path the download reads.
export function trackPeerDownload<T>(
  token: string,
  slug: string,
  name: string,
  download: Promise<T>,
): Promise<T> {
  return track(token, slug, name, downloadToast, true, download);
}

function track<T>(
  token: string,
  slug: string,
  name: string,
  describe: typeof uploadToast,
  waitsForBytes: boolean,
  transfer: Promise<T>,
): Promise<T> {
  subscribe();
  const tracked: Tracked = {
    name,
    alias: peerAlias([], slug),
    describe,
    progress: null,
    waitsForBytes,
    due: false,
    shown: false,
    timer: setTimeout(() => {
      tracked.due = true;
      show(token, tracked);
    }, SHOW_AFTER_MS),
  };
  inflight.set(token, tracked);
  void aliasFor(slug).then((alias) => {
    tracked.alias = alias;
    if (tracked.shown && inflight.get(token) === tracked) render(token, tracked);
  });
  return transfer.finally(() => {
    clearTimeout(tracked.timer);
    // A second transfer under the same token (the same file opened again) has
    // taken the toast over, and clears it itself.
    if (inflight.get(token) !== tracked) return;
    inflight.delete(token);
    if (tracked.shown) toast.dismiss(token);
  });
}
