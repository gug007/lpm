/** An emoji sized to sit in a 20px row line or a menu row's icon slot. */
export function WorkStatusEmoji({ emoji }: { emoji: string }) {
  return (
    <span aria-hidden="true" className="shrink-0 text-[13px] leading-none">
      {emoji}
    </span>
  );
}
