import type { ReactNode } from "react";
import { GeneratedFileInfo } from "./GeneratedFileInfo";

// A media viewer with, under it, how lpm made the file when an agent did. What
// lpm made is on this computer or a connected one, so a file on an SSH host
// hides it.
export function GeneratedMedia({
  absPath,
  compact = false,
  hidden = false,
  children,
}: {
  absPath: string;
  compact?: boolean;
  hidden?: boolean;
  children: ReactNode;
}) {
  if (compact || hidden) return <>{children}</>;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">{children}</div>
      <GeneratedFileInfo absPath={absPath} />
    </div>
  );
}
