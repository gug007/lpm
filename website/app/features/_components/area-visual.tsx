import type { ReactNode } from "react";

type Props = { caption: string; children: ReactNode };

export default function AreaVisual({ caption, children }: Props) {
  return (
    <figure className="-mx-2 mb-10 max-w-4xl sm:mx-auto">
      {children}
      <figcaption className="mx-auto mt-4 max-w-2xl text-pretty text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {caption}
      </figcaption>
    </figure>
  );
}
