import { isOutside, type ListeningPort } from "./portsModel";

export interface SystemHolder {
  label: string;
  // How to free the port for good, when a setting controls it.
  fix?: (port: number) => string;
}

const AIR_PLAY: SystemHolder = {
  label: "macOS · AirPlay Receiver",
  fix: (port) => `To free :${port}, turn off AirPlay Receiver in System Settings › General › AirDrop & Handoff.`,
};

// Keyed by lowercase process name.
const HOLDERS: Record<string, SystemHolder> = {
  controlcenter: AIR_PLAY,
  airplayxpchelper: AIR_PLAY,
  rapportd: { label: "macOS · Handoff" },
  sharingd: { label: "macOS · Sharing" },
  cupsd: { label: "Printing service" },
  // `ss` cuts process names at 15 characters.
  "systemd-resolve": { label: "Linux · DNS resolver" },
  svchost: { label: "Windows · Service Host" },
  system: { label: "Windows · System" },
};

// The operating system's own process on a port. Ending one rarely lasts: the
// system starts it again.
export function systemHolder(p: ListeningPort): SystemHolder | null {
  return isOutside(p) ? (HOLDERS[p.process.toLowerCase()] ?? null) : null;
}
