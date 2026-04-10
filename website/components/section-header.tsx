import type { ReactNode } from "react";

type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  as: As = "h2",
  className = "mb-14",
}: Props) {
  return (
    <div className={`text-center ${className}`}>
      {eyebrow && (
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/60 px-3 py-1 rounded-full mb-4">
          {eyebrow}
        </span>
      )}
      <As
        className={
          As === "h1"
            ? "text-3xl sm:text-4xl font-bold tracking-tight"
            : "text-2xl sm:text-3xl font-bold tracking-tight"
        }
      >
        {title}
      </As>
      {description && (
        <p className="mt-3 text-sm sm:text-base text-gray-400 dark:text-gray-500 max-w-lg mx-auto leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
