export function BetaTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9.5px] font-semibold uppercase leading-[14px] tracking-wider ${className}`}
    >
      Beta
    </span>
  );
}
