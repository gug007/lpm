import { CommandBlock } from "@/components/command-block";
import { SectionHeader } from "@/components/section-header";
import { YouTubeVideo } from "@/components/youtube-video";

const CHAPTER_START = 39;

export default function LpmPorts() {
  return (
    <section className="bg-gray-50/70 py-16 sm:py-20 dark:bg-white/[0.02]">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Stop chasing it"
          title="Let the app that starts your servers check the ports"
          description="lpm, a free desktop app, starts each project's dev servers with one click. Before it starts one, it checks the service's port."
        />
        <div className="grid items-start gap-10 md:grid-cols-2">
          <div className="min-w-0 space-y-6 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                It names what holds the port
              </h3>
              <p className="mt-1.5">
                Another lpm project, or a process and its PID, and it can stop
                that and start yours in one click.
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                You choose what happens, per service
              </h3>
              <p className="mt-1.5 mb-2">
                <code className="font-mono">ask</code>, the default, asks before
                freeing the port. <code className="font-mono">free</code> frees it
                without asking, and <code className="font-mono">fail</code> refuses
                to start.
              </p>
              <CommandBlock>{"web: { cmd: npm run dev, port: 3000, portConflict: free }"}</CommandBlock>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Every listening port, and who holds it
              </h3>
              <p className="mt-1.5 mb-2">
                The lpm command lists each listening TCP port with the project
                and service behind it.
              </p>
              <CommandBlock>lpm ports</CommandBlock>
            </div>
            <p className="text-[13px] text-gray-500 dark:text-gray-400">
              lpm checks ports. It doesn&rsquo;t assign or isolate them.
            </p>
          </div>
          <div className="min-w-0">
            <YouTubeVideo
              lesson="lpm-in-3-minutes"
              start={CHAPTER_START}
              className="rounded-xl ring-1 ring-black/5 dark:ring-white/10"
            />
            <p className="mt-2 text-[13px] text-gray-500 dark:text-gray-400">
              From 0:39 in the three-minute tour: free a busy port in one click.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
