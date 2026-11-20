import type { ReactNode } from "react";
import { GeneratedFileInfo } from "./GeneratedFileInfo";

// A media viewer with, under it, how lpm made the file when an agent did.
export function GeneratedMedia({
  absPath,
  compact = false,
  children,
}: {
  absPath: string;
  compact?: boolean;
  children: ReactNode;
}) {
  if (compact) return <>{children}</>;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="min-h-0 flex-1">{children}</div>
      <GeneratedFileInfo absPath={absPath} />
    </div>
  );
}
