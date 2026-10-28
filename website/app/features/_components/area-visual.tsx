import type { ReactNode } from "react";

type Props = { caption?: string; className?: string; children: ReactNode };

export default function AreaVisual({ caption, className = "", children }: Props) {
  return (
    <figure className={`min-w-0 ${className}`}>
      {children}
      {caption && (
        <figcaption className="mt-4 max-w-2xl text-pretty text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
