import { CommandBlock } from "@/components/command-block";

export function CommandList({
  items,
}: {
  items: readonly { label: string; command: string }[];
}) {
  return (
    <dl className="mt-4 space-y-3">
      {items.map(({ label, command }) => (
        <div key={label}>
          <dt className="text-[13px] font-medium text-gray-900 dark:text-gray-100">
            {label}
          </dt>
          <dd className="mt-1">
            <CommandBlock>{command}</CommandBlock>
          </dd>
        </div>
      ))}
    </dl>
  );
}
