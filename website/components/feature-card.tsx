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
      className={`group ${s.padding} rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-md dark:hover:shadow-none hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-all duration-200`}
    >
      <div
        className={`${s.iconBox} flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 group-hover:bg-gray-900 group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-gray-900 transition-colors duration-200`}
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
