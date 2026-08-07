import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  size?: "sm" | "lg";
};

const SIZE_STYLES = {
  sm: {
    padding: "p-6",
    iconBox: "w-9 h-9 mb-4",
    icon: "w-4 h-4",
    title: "text-sm font-semibold mb-1.5",
  },
  lg: {
    padding: "p-8",
    iconBox: "w-10 h-10 mb-5",
    icon: "w-5 h-5",
    title: "text-base font-semibold mb-2 text-gray-900 dark:text-gray-100",
  },
} as const;

export function FeatureCard({
  icon: Icon,
  title,
  children,
  size = "sm",
}: FeatureCardProps) {
  const s = SIZE_STYLES[size];
  return (
    <div
      className={`${s.padding} rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-white/[0.02]`}
    >
      <div
        className={`${s.iconBox} flex items-center justify-center rounded-lg bg-white dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-white/[0.06]`}
      >
        <Icon className={s.icon} />
      </div>
      <h3 className={s.title}>{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
