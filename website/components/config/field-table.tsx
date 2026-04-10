import type { ReactNode } from "react";

export type Field = {
  name: string;
  type: string;
  required: boolean;
  description: ReactNode;
};

export function FieldTable({ fields }: { fields: Field[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
      <table className="w-full text-xs text-left text-gray-700 dark:text-gray-300">
        <thead className="bg-gray-50 dark:bg-gray-900/80 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Field
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Type
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Required
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Description
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
          {fields.map((f) => (
            <tr key={f.name}>
              <td className="px-4 py-2.5 font-mono">{f.name}</td>
              <td className="px-4 py-2.5">{f.type}</td>
              <td className="px-4 py-2.5">{f.required ? "yes" : "no"}</td>
              <td className="px-4 py-2.5">{f.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
