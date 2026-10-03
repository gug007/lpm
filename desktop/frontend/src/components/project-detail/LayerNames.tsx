export function LayerNames({ labels }: { labels: string[] }) {
  return labels.map((label, i) => (
    <span key={i}>
      {i > 0 && (i === labels.length - 1 ? " and " : ", ")}
      <span className="font-medium text-[var(--text-primary)]">{label}</span>
    </span>
  ));
}
