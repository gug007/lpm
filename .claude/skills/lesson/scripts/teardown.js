// What a take has to undo however it ends — the app, the capture, the
// pointer, the services — registered as it is set up and run in reverse, on
// success, on an error, or on Ctrl-C / a kill signal.
const pending = [];

function onTeardown(fn) {
  pending.push(fn);
  return () => {
    const i = pending.indexOf(fn);
    if (i >= 0) pending.splice(i, 1);
  };
}

async function runTeardown(log = (m) => console.error(m)) {
  while (pending.length) {
    const fn = pending.pop();
    try {
      await fn();
    } catch (e) {
      log(`cleanup: ${e.message}`);
    }
  }
}

let installed = false;
function exitOnSignals() {
  if (installed) return;
  installed = true;
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.once(sig, () => {
      console.error(`\n${sig}: stopping the take and cleaning up`);
      runTeardown().finally(() => process.exit(130));
    });
  }
}

module.exports = { onTeardown, runTeardown, exitOnSignals };
