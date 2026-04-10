import type { ReactNode } from "react";

export type Field = {
  name: string;
  type: string;
  required: boolean;
  description: ReactNode;
};

export function FieldTable({ fields }: { fields: Field[] }) {
  const hasRequired = fields.some((f) => f.required);
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-50 dark:bg-gray-900/60 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Field
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Type
              </th>
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Description
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 align-top">
            {fields.map((f) => (
              <tr key={f.name}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <code className="font-mono text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                    {f.name}
                  </code>
                  {f.required && (
                    <span
                      aria-label="required"
                      className="text-rose-500 ml-0.5"
                    >
                      *
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {f.type}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-gray-400 leading-relaxed">
                  {f.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasRequired && (
        <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
          <span className="text-rose-500">*</span> required
        </p>
      )}
    </div>
  );
}
