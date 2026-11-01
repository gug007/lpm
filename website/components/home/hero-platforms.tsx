import type { DesktopOs } from "@/lib/downloads";
import { downloadOsHref } from "./download-os-hash";

const OTHERS: Record<DesktopOs, { label: string; first: DesktopOs }> = {
  macos: { label: "Windows, Linux & iPhone", first: "windows" },
  windows: { label: "macOS, Linux & iPhone", first: "macos" },
  linux: { label: "macOS, Windows & iPhone", first: "macos" },
};

// The split button's chevron is the only other hint that lpm isn't Mac-only,
// so the trust line ends on the systems the offered build isn't for. The link
// opens the download section's full table, which also links the iPhone app.
export function HeroPlatforms({
  os,
  className,
}: {
  os: DesktopOs;
  className: string;
}) {
  const { label, first } = OTHERS[os];
  return (
    <a href={downloadOsHref(first)} className={className}>
      Also on {label}
    </a>
  );
}
