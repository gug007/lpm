import type { ReactNode } from "react";
import { Bullet } from "@/components/config/bullet";

export function GuideList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
      {items.map((item, i) => (
        <Bullet key={i}>{item}</Bullet>
      ))}
    </ul>
  );
}
