import Image from "next/image";

export function PhonePushReplica() {
  return (
    <div
      aria-hidden="true"
      className="rounded-[1.4rem] bg-white/90 p-3.5 text-left shadow-lg shadow-gray-900/10 ring-1 ring-gray-200 backdrop-blur dark:bg-[#2a2a2a]/90 dark:shadow-black/40 dark:ring-white/10"
    >
      <div className="flex items-center gap-2">
        <Image
          src="/icon.png"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 rounded-[5px] bg-gray-700 p-0.5"
        />
        <span className="flex-1 text-[12px] font-medium text-gray-500 dark:text-gray-400">
          lpm
        </span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">2m ago</span>
      </div>
      <p className="mt-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">api</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-gray-600 dark:text-gray-300">
        Upstream watch — Automation finished · 2 new upstream commits; one
        changes the orders table migration.
      </p>
    </div>
  );
}
