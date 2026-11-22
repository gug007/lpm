import { useEffect, useState } from "react";
import { ChevronRight, SquareTerminal } from "lucide-react";
import { BrowseFolder, WslDistros, WslHome } from "../../bridge/commands";
import { toast } from "../notifications/toast";
import { useAppStore } from "../store/app";

interface Distro {
  name: string;
  isDefault: boolean;
  version: number;
  running: boolean;
}

/** Add a project › WSL folder (Windows): the distros this PC has. Picking one
 *  opens the folder picker in its home, and the folder becomes a project whose
 *  services, terminals and agents run inside that distro. */
export function WslDistroScreen() {
  const [distros, setDistros] = useState<Distro[] | null>(null);
  const close = useAppStore((s) => s.closeAddProjectPicker);
  const addLocalFolder = useAppStore((s) => s.addLocalFolder);

  useEffect(() => {
    let current = true;
    WslDistros()
      .then((list) => current && setDistros(list))
      .catch(() => current && setDistros([]));
    return () => {
      current = false;
    };
  }, []);

  const pick = async (distro: string) => {
    try {
      const home = await WslHome(distro);
      close();
      const dir = await BrowseFolder(home);
      if (!dir) return;
      const adopted = await addLocalFolder(dir);
      if (adopted) useAppStore.setState({ selected: adopted.name, view: "projects" });
    } catch (err) {
      toast.error(`Couldn't open ${distro}`, { description: String(err) });
    }
  };

  if (distros === null) {
    return <p className="px-6 pb-5 pt-2 text-[12px] text-[var(--text-muted)]">Looking for WSL distros…</p>;
  }
  if (distros.length === 0) {
    return (
      <p className="px-6 pb-5 pt-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
        This PC has no WSL distro. Install one by running{" "}
        <code className="rounded bg-[var(--bg-hover)] px-1 font-mono text-[11.5px]">wsl --install</code> in
        PowerShell, then come back.
      </p>
    );
  }
  return (
    <div className="flex flex-col px-2 pb-2 pt-1">
      <p className="px-4 pb-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
        Pick the distro the code lives in. Its services, terminals and agents run there.
      </p>
      {distros.map((d) => (
        <button
          key={d.name}
          onClick={() => void pick(d.name)}
          className="group flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all hover:bg-[var(--bg-hover)]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[#f97316] transition-colors group-hover:bg-[var(--bg-active)]">
            <SquareTerminal size={20} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">{d.name}</div>
            <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              WSL {d.version}
              {d.isDefault ? " · default" : ""}
              {d.running ? " · running" : ""}
            </div>
          </div>
          <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
        </button>
      ))}
    </div>
  );
}
