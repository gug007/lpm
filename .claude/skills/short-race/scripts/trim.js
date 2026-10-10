// The payoff with only the colour bars (compare.json "payoff": "bars"): once
// both pages are open, each row's project header, browser address bar and git
// bar go, with the sidebar's expand button by the traffic lights, so the games
// get the rows' full height. A strip stays at the top for
// the traffic lights macOS draws over the window, and the pages reload so each
// game starts at its final size rather than refitting mid-play.
const TRAFFIC_LIGHTS_PT = 28;

const hideChrome = (s) =>
  s.control.evaluate((strip) => {
    const hide = (el) => el && (el.style.display = "none");
    const columns = [...document.querySelectorAll("[data-project-column]")];
    for (const col of columns) {
      // The project header: its name row and, in a narrow window, the row its
      // action buttons wrap onto.
      col.querySelector(".flex.h-full.flex-col")?.querySelectorAll(":scope > .app-drag").forEach(hide);
      hide(col.querySelector('[data-actions-group="footer"]')?.closest(".composer-terminal-surface"));
      hide(col.querySelector('button[aria-label="Back"]')?.parentElement);
      col.style.paddingTop = "0px";
    }
    hide(document.querySelector('button[title^="Expand sidebar"]')?.parentElement);
    const grid = columns[0]?.parentElement;
    const heads = [...document.querySelectorAll('[data-lesson^="head-"]')];
    if (!grid || !heads.length) return 0;
    const top = Math.min(...heads.map((h) => h.getBoundingClientRect().top));
    grid.style.paddingTop = `${Math.max(0, strip - top)}px`;
    return columns.length;
  }, TRAFFIC_LIGHTS_PT);

const reloadPages = (s) =>
  s.control.evaluate(() => {
    const buttons = [...document.querySelectorAll('[data-project-column] button[aria-label="Reload"]')];
    buttons.forEach((b) => b.click());
    return buttons.length;
  });

async function trimPayoff(s) {
  const rows = await hideChrome(s);
  await s.hold(700);
  const pages = await reloadPages(s);
  await s.hold(1200);
  s.log(`payoff trimmed to the colour bars: ${rows} rows, ${pages} pages reloaded`);
}

module.exports = { trimPayoff };
