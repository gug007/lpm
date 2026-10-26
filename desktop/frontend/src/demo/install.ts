import { resolveCommand } from "./backend";
import { seedSettings } from "./commands/settings";
import { loadSeed } from "./commands/state";
import { seedTerminals } from "./commands/terminals";
import { seedTools } from "./commands/tools";
import { installIpc } from "./ipc";
import { startConfigPreview } from "./preview";
import { seedFor } from "./seed";
import { connectTour } from "./tour/bridge";
import { setInitialProject } from "./tour/done";
import { drawWindowButtons } from "./window-buttons";

window.__LPM_PLATFORM__ = "macos";

const { seed, omit, selected, preview } = seedFor(new URLSearchParams(window.location.search));
loadSeed(seed, omit);
seedSettings(selected);
setInitialProject(selected);
seedTerminals();
seedTools(!!selected);
installIpc(resolveCommand);
if (preview) startConfigPreview();
else connectTour();
drawWindowButtons();
