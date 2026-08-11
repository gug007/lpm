// Frontmatter keys every agent CLI reads. Anything else is vendor-specific and
// gets flagged, because a skill carrying one will not port to another agent.
const PORTABLE = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

interface ToolkitFrontmatterProps {
  fields: { key: string; value: string }[];
}

export function ToolkitFrontmatter({ fields }: ToolkitFrontmatterProps) {
  if (fields.length === 0) return null;
  return (
    <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-[var(--border)] pb-3">
      {fields.map((field) => {
        const portable = PORTABLE.has(field.key);
        return (
          <div key={field.key} className="contents">
            <dt
              className={`font-mono text-[10.5px] leading-5 ${
                portable ? "text-[var(--text-muted)]" : "text-[var(--accent-amber-text)]"
              }`}
              title={portable ? undefined : "Not portable — other agents ignore this key"}
            >
              {field.key}
            </dt>
            <dd className="min-w-0 truncate text-[11.5px] leading-5 text-[var(--text-secondary)]">
              {field.value || <span className="text-[var(--text-muted)]">—</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
