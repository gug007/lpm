import { ReleaseChecksums } from "@/components/home/release-checksums";
import { LINK, P } from "@/components/prose";
import { CHECKSUM_COMMANDS } from "@/lib/downloads";
import { RELEASES_URL } from "@/lib/links";
import { getLatestReleaseVerification } from "@/lib/release-verification";
import { CommandList } from "./command-list";

const MAC_CHECKS = [
  {
    label: "The signature is intact",
    command: "codesign --verify --deep --strict --verbose=2 /Applications/lpm.app",
  },
  {
    label: "Gatekeeper accepts it as notarized",
    command: "spctl --assess --type execute --verbose /Applications/lpm.app",
  },
  {
    label: "It was signed by lpm's developer team",
    command: "codesign -dv /Applications/lpm.app 2>&1 | grep TeamIdentifier",
  },
];

export async function VerifyDownloads() {
  const release = await getLatestReleaseVerification();

  return (
    <>
      <p className={P}>
        Compare the file&rsquo;s SHA-256 with the one GitHub lists for it. For
        the Windows and Linux beta, which isn&rsquo;t code-signed yet, this is
        the check that matters.
      </p>
      <CommandList items={CHECKSUM_COMMANDS} />

      <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-white/[0.025] [&>details]:border-t-0">
        {release ? (
          <ReleaseChecksums release={release} />
        ) : (
          <p className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
            The checksums are listed on the{" "}
            <a href={RELEASES_URL} className={LINK}>
              latest GitHub release
            </a>
            .
          </p>
        )}
      </div>

      <h3 className="mt-8 text-[15px] font-semibold text-gray-900 dark:text-white">
        On a Mac, check the signature too
      </h3>
      <p className={`mt-2 ${P}`}>
        After moving lpm to Applications, these should report a valid
        signature, &ldquo;source=Notarized Developer ID&rdquo; and
        TeamIdentifier=N7S7ZCZ5P7.
      </p>
      <CommandList items={MAC_CHECKS} />
    </>
  );
}
