import Link from "next/link";

export function SafetyLink({ className }: { className: string }) {
  return (
    <Link href="/#download-safety" prefetch={false} className={className}>
      Safety, checksums &amp; removal
    </Link>
  );
}
