import { APP_STORE_URL } from "@/lib/links";

export default function AppStoreButton() {
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download lpm link on the App Store"
      className="group inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-full bg-black px-10 py-[18px] text-white shadow-sm ring-1 ring-gray-900/10 transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:bg-gray-900 hover:shadow-lg active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-white/25 dark:hover:ring-white/40 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950 sm:w-auto sm:max-w-none sm:px-7 sm:py-3.5"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-7 w-7 flex-shrink-0 -mt-0.5 sm:h-6 sm:w-6"
        aria-hidden="true"
      >
        <path d="M17.05 12.536c-.028-2.844 2.325-4.21 2.432-4.275-1.325-1.937-3.385-2.2-4.116-2.229-1.75-.176-3.418 1.03-4.31 1.03-.886 0-2.25-1.005-3.703-.975-1.905.028-3.66 1.108-4.64 2.81-1.977 3.426-.506 8.503 1.42 11.294.94 1.367 2.062 2.902 3.534 2.848 1.42-.057 1.957-.918 3.676-.918 1.72 0 2.202.918 3.702.888 1.53-.028 2.499-1.393 3.432-2.77 1.081-1.587 1.527-3.126 1.554-3.205-.034-.015-2.98-1.142-3.013-4.527l.032-.005zM14.28 4.165c.784-.952 1.31-2.272 1.167-3.589-1.128.047-2.494.75-3.304 1.7-.728.842-1.362 2.186-1.192 3.476 1.26.098 2.544-.64 3.33-1.587z" />
      </svg>
      <span className="flex flex-col items-start">
        <span className="text-[12px] leading-none tracking-wide text-gray-300 sm:text-[10px]">
          Download on the
        </span>
        <span className="mt-1 text-[21px] font-medium leading-none tracking-tight sm:text-[17px]">
          App Store
        </span>
      </span>
    </a>
  );
}
