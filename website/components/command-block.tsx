const SIZE = {
  md: "px-3 py-2 text-[12.5px]",
  sm: "px-2.5 py-1.5 text-[12px]",
} as const;

export function CommandBlock({
  children,
  size = "md",
  className = "",
}: {
  children: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <code
      tabIndex={0}
      className={`block select-all overflow-x-auto whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 font-mono text-gray-800 dark:border-gray-800 dark:bg-black/30 dark:text-gray-200 ${SIZE[size]} ${className}`}
    >
      {children}
    </code>
  );
}
