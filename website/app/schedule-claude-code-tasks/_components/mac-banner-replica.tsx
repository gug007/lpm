import Image from "next/image";

export function MacBannerReplica() {
  return (
    <div
      aria-hidden="true"
      className="flex items-start gap-3 rounded-2xl bg-white/90 p-3.5 text-left shadow-lg shadow-gray-900/10 ring-1 ring-gray-200 backdrop-blur dark:bg-[#2a2a2a]/90 dark:shadow-black/40 dark:ring-white/10"
    >
      <Image
        src="/icon.png"
        alt=""
        width={36}
        height={36}
        className="h-9 w-9 shrink-0 rounded-lg bg-gray-700 p-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
            Automation finished
          </span>
          <span className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400">now</span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-gray-600 dark:text-gray-300">
          &ldquo;Nightly dependency update&rdquo; in saas-app is done. Updated 9
          packages in the copy. Tests pass. · $0.84 · checks passed
        </p>
      </div>
    </div>
  );
}
