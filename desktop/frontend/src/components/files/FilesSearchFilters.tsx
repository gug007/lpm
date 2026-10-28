import type { SearchField } from "./fileSearch";
import { FIELD_ERROR, TEXT_INPUT, fieldInputClass } from "./searchFieldStyles";

interface FilesSearchFiltersProps {
  include: string;
  onIncludeChange: (text: string) => void;
  exclude: string;
  onExcludeChange: (text: string) => void;
  // A glob that doesn't parse, and which field it's in.
  invalid: { field: SearchField; message: string } | null;
}

const FIELDS = [
  { field: "include", label: "Files to include", placeholder: "Include: src, *.ts" },
  { field: "exclude", label: "Files to exclude", placeholder: "Exclude: *.test.ts" },
] as const;

// Comma lists of globs under the query. A plain name or path takes the
// folder: `src` searches everything under any folder called src.
export function FilesSearchFilters({
  include,
  onIncludeChange,
  exclude,
  onExcludeChange,
  invalid,
}: FilesSearchFiltersProps) {
  const values = { include, exclude };
  const setters = { include: onIncludeChange, exclude: onExcludeChange };
  return (
    <div className="flex shrink-0 flex-col gap-1 pl-8 pr-8 pt-1">
      {FIELDS.map(({ field, label, placeholder }) => {
        const error = invalid?.field === field ? invalid.message : null;
        return (
          <div key={field}>
            <input
              {...TEXT_INPUT}
              value={values[field]}
              onChange={(e) => setters[field](e.target.value)}
              placeholder={placeholder}
              aria-label={label}
              aria-invalid={error !== null}
              className={`${fieldInputClass(error !== null)} px-2 font-mono text-[11.5px]`}
            />
            {error && (
              <p role="alert" className={FIELD_ERROR}>
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
