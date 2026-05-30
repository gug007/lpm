/** Prefixes an emoji onto a label for display, e.g. "🚀 Deploy". */
export function withEmoji(emoji: string | undefined, label: string): string {
  return emoji ? `${emoji} ${label}` : label;
}
