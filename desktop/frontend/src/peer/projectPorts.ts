import { toast } from "../notifications/toast";
import { PeerPortForward, SetClipboardText } from "../../bridge/commands";
import { BrowserOpenURL } from "../../bridge/runtime";
import { peerSlugOf } from "./markers";

const LOOPBACK_URL = /^(https?:\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)(.*)$/i;

// The port on this Mac that reaches `port` on the paired machine `slug`, or on
// this Mac when null: a local port tunnelled to the machine (porttunnel.rs).
async function localPortOn(slug: string | null, port: number): Promise<number> {
  return slug ? Number(await PeerPortForward(slug, port)) : port;
}

// The port on this Mac that reaches a project's `port`.
export async function projectLocalPort(projectName: string, port: number): Promise<number> {
  return localPortOn(peerSlugOf(projectName), port);
}

export async function projectPortUrl(projectName: string, port: number): Promise<string> {
  return `http://localhost:${await projectLocalPort(projectName, port)}`;
}

// Open `port` on machine `slug` (null: this Mac) in the default browser, saying
// why when it can't be reached.
export async function openPortOn(slug: string | null, port: number): Promise<void> {
  try {
    BrowserOpenURL(`http://localhost:${await localPortOn(slug, port)}`);
  } catch (err) {
    toast.error(`Couldn't open :${port}: ${err}`);
  }
}

// The address this Mac reaches `port` on machine `slug` at, on the clipboard.
export async function copyPortUrlOn(slug: string | null, port: number): Promise<void> {
  try {
    const url = `http://localhost:${await localPortOn(slug, port)}`;
    await SetClipboardText(url);
    toast.success(`Copied ${url}`);
  } catch (err) {
    toast.error(`Couldn't copy :${port}: ${err}`);
  }
}

export function openProjectPort(projectName: string, port: number): Promise<void> {
  return openPortOn(peerSlugOf(projectName), port);
}

export function copyProjectPortUrl(projectName: string, port: number): Promise<void> {
  return copyPortUrlOn(peerSlugOf(projectName), port);
}

// An address typed into a project's browser: a paired machine's project means
// that machine's localhost.
export async function projectAddress(projectName: string, url: string): Promise<string> {
  const m = LOOPBACK_URL.exec(url);
  if (!m || !peerSlugOf(projectName)) return url;
  const [, scheme, port, rest] = m;
  return `${scheme}localhost:${await projectLocalPort(projectName, Number(port))}${rest}`;
}
