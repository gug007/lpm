import { fileManagerName, isMac, type Platform, platform } from "./platform";

// How the copy names the machine lpm runs on, and the other ones it pairs
// with: a Mac on macOS, a computer on Linux and Windows.
export function machineWords(mac: boolean = isMac) {
  const noun = mac ? "Mac" : "computer";
  const Noun = mac ? "Mac" : "Computer";
  return {
    noun,
    Noun,
    plural: `${noun}s`,
    Plural: `${Noun}s`,
    thisMachine: `this ${noun}`,
    ThisMachine: `This ${noun}`,
    ThisMachineTitle: `This ${Noun}`,
    anotherMachine: `another ${noun}`,
    AnotherMachine: `Another ${noun}`,
    otherMachine: `the other ${noun}`,
    OtherMachine: `The other ${noun}`,
  };
}

export const MACHINE = machineWords();

// The row-menu entry that shows a file in the system file manager.
export function revealLabel(p: Platform = platform): string {
  return p === "macos" ? "Reveal in Finder" : `Show in ${fileManagerName(p)}`;
}
