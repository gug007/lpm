import { Cpu, ShieldAlert } from "lucide-react";
import type { DesktopOs } from "@/lib/downloads";
import { SignatureBadge } from "./signature-badge";

const NOTE =
  "inline-flex items-start gap-1.5 text-left text-[11px] text-gray-500 dark:text-gray-400";
const ICON = "mt-[3px] h-3 w-3 shrink-0";

// A hero shows no requirements line of its own, so there the Windows note
// leads with the supported system; the downloads column already lists it.
export function DownloadNote({
  os,
  withRequirement = false,
}: {
  os: DesktopOs;
  withRequirement?: boolean;
}) {
  if (os === "macos") return <SignatureBadge />;
  if (os === "windows") {
    return (
      <span className={NOTE}>
        <ShieldAlert className={ICON} aria-hidden="true" />
        {withRequirement && "Windows 11, x64. "}Not code-signed yet: if
        SmartScreen warns, choose More info, then Run anyway.
      </span>
    );
  }
  return (
    <span className={NOTE}>
      <Cpu className={ICON} aria-hidden="true" />
      64-bit x86 only. Needs glibc 2.35 or newer, as in Ubuntu 22.04 and up.
    </span>
  );
}
