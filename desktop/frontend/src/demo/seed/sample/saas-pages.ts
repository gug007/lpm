import type { SeedPage } from "../types";

// Pages are written the way a project's own are: lpm's colors as --lpm-*
// variables, the data on window.lpm, and lpm.run for the project's actions
// (mobile/shared/web/popup/bootstrap.js).
const BASE_STYLE = `
  body { margin: 0; font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--lpm-text); background: var(--lpm-bg); }
  .muted { color: var(--lpm-muted); }
`;

export const DEPLOYS_PAGE: SeedPage = {
  data: {
    days: [
      { day: "Sun", deploys: 1, failed: 0 },
      { day: "Mon", deploys: 3, failed: 0 },
      { day: "Tue", deploys: 2, failed: 0 },
      { day: "Wed", deploys: 4, failed: 0 },
      { day: "Thu", deploys: 2, failed: 0 },
      { day: "Fri", deploys: 3, failed: 1 },
      { day: "Sat", deploys: 1, failed: 0 },
    ],
    last: "2 h ago",
    failure: "Fri: migration timed out, rolled back",
  },
  html: `<!doctype html>
<style>${BASE_STYLE}
  .wrap { padding: 12px 14px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .total { font-size: 15px; font-weight: 600; }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 84px; margin-top: 10px;
    border-bottom: 1px solid var(--lpm-border); }
  .bar { flex: 1; border-radius: 3px 3px 0 0; background: var(--lpm-accent); }
  .bar.failed { background: var(--lpm-red); }
  .days { display: flex; gap: 6px; margin-top: 4px; font-size: 10px; }
  .days span { flex: 1; text-align: center; }
  .note { margin-top: 10px; }
</style>
<div class="wrap">
  <div class="top"><span class="total" id="total"></span><span class="muted" id="last"></span></div>
  <div class="bars" id="bars"></div>
  <div class="days muted" id="days"></div>
  <div class="note muted" id="note"></div>
</div>
<script>
  function draw(d) {
    if (!d) return;
    var total = 0, most = 1;
    d.days.forEach(function (x) { total += x.deploys; most = Math.max(most, x.deploys); });
    document.getElementById("total").textContent = total + " deploys this week";
    document.getElementById("last").textContent = "last " + d.last;
    document.getElementById("bars").innerHTML = d.days.map(function (x) {
      return '<span class="bar' + (x.failed ? " failed" : "") + '" style="height:' + (x.deploys / most) * 100 + '%"></span>';
    }).join("");
    document.getElementById("days").innerHTML = d.days.map(function (x) { return "<span>" + x.day + "</span>"; }).join("");
    document.getElementById("note").textContent = d.failure;
  }
  draw(lpm.data);
  lpm.onData(draw);
</script>`,
};

export const REVENUE_PAGE: SeedPage = {
  data: {
    mrr: 48210,
    change: 6.2,
    trials: 37,
    churn: 1.8,
    weeks: [39.1, 40.2, 41.0, 42.8, 44.0, 45.3, 46.9, 48.2],
    plans: [
      { name: "Starter", customers: 412, mrr: 8240 },
      { name: "Pro", customers: 188, mrr: 22560 },
      { name: "Team", customers: 46, mrr: 17410 },
    ],
  },
  html: `<!doctype html>
<style>${BASE_STYLE}
  .wrap { padding: 20px 24px; max-width: 760px; }
  h1 { margin: 0; font-size: 18px; }
  .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
  .tile { border: 1px solid var(--lpm-border); border-radius: 10px; padding: 12px 14px; background: var(--lpm-surface); }
  .big { font-size: 22px; font-weight: 600; margin-top: 2px; }
  .up { color: var(--lpm-green); }
  svg { display: block; width: 100%; height: 90px; margin-top: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  td, th { text-align: left; padding: 7px 0; border-bottom: 1px solid var(--lpm-border); }
  th { font-weight: 500; }
  .num { text-align: right; }
  .run { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
  button { font: inherit; color: var(--lpm-bg); background: var(--lpm-accent); border: 0; border-radius: 7px;
    padding: 7px 12px; cursor: pointer; }
</style>
<div class="wrap">
  <h1>Revenue</h1>
  <div class="muted">From the billing database, refreshed when the tab opens</div>
  <div class="tiles">
    <div class="tile"><div class="muted">Monthly recurring</div><div class="big" id="mrr"></div><div class="up" id="change"></div></div>
    <div class="tile"><div class="muted">On a 14-day trial</div><div class="big" id="trials"></div></div>
    <div class="tile"><div class="muted">Churn, last 30 days</div><div class="big" id="churn"></div></div>
  </div>
  <svg id="line" viewBox="0 0 700 90" preserveAspectRatio="none" aria-label="Monthly recurring revenue, last 8 weeks"></svg>
  <table><thead><tr><th>Plan</th><th class="num">Customers</th><th class="num">MRR</th></tr></thead><tbody id="plans"></tbody></table>
  <div class="run"><button id="test" type="button">Run Tests</button><span class="muted" id="result">Runs the project's Run Tests action</span></div>
</div>
<script>
  function money(n) { return "$" + n.toLocaleString("en-US"); }
  function draw(d) {
    if (!d) return;
    document.getElementById("mrr").textContent = money(d.mrr);
    document.getElementById("change").textContent = "+" + d.change + "% this month";
    document.getElementById("trials").textContent = d.trials;
    document.getElementById("churn").textContent = d.churn + "%";
    var lo = Math.min.apply(null, d.weeks), hi = Math.max.apply(null, d.weeks), step = 700 / (d.weeks.length - 1);
    var points = d.weeks.map(function (v, i) { return (i * step) + "," + (82 - ((v - lo) / (hi - lo)) * 74); }).join(" ");
    document.getElementById("line").innerHTML = '<polyline fill="none" stroke="var(--lpm-accent)" stroke-width="2.5" points="' + points + '"/>';
    document.getElementById("plans").innerHTML = d.plans.map(function (p) {
      return "<tr><td>" + p.name + '</td><td class="num">' + p.customers + '</td><td class="num">' + money(p.mrr) + "</td></tr>";
    }).join("");
  }
  draw(lpm.data);
  lpm.onData(draw);
  document.getElementById("test").addEventListener("click", function () {
    var result = document.getElementById("result");
    result.textContent = "Running…";
    lpm.run("test").then(function (r) {
      result.textContent = r.ok ? "Tests passed" : (r.error || "The tests failed");
    });
  });
</script>`,
};
