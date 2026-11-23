const $ = (s) => document.querySelector(s);
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

async function render() {
  const { sites = [], usage = {}, reasons = [], settings } = await browser.storage.local.get([
    "sites", "usage", "reasons", "settings",
  ]);
  const s = { ...DEFAULTS, ...settings };
  for (const k of Object.keys(DEFAULTS)) $("#" + k).value = s[k];

  // Sites
  const box = $("#sites");
  box.replaceChildren();
  if (!sites.length) box.append(el("p", "No sites yet.", "muted"));
  for (const site of sites) {
    const chip = el("div", undefined, "chip");
    const rm = el("button", "×", "ghost");
    rm.title = "Remove";
    rm.onclick = async () => {
      await browser.storage.local.set({ sites: sites.filter((x) => x !== site) });
      render();
    };
    chip.append(el("span", site), rm);
    box.append(chip);
  }

  // Week table
  const days = Array.from({ length: 7 }, (_, i) => dayKey(new Date(Date.now() - i * 864e5)));
  const allSites = [...new Set([...sites, ...days.flatMap((d) => Object.keys(usage[d] || {}))])].sort();
  const table = el("table");
  const head = el("tr");
  head.append(el("th", "Site"));
  for (const d of days) head.append(el("th", d.slice(5), "num"));
  table.append(head);
  const totals = days.map(() => 0);
  for (const site of allSites) {
    const tr = el("tr");
    tr.append(el("td", site));
    days.forEach((d, i) => {
      const v = (usage[d] || {})[site] || 0;
      totals[i] += v;
      tr.append(el("td", v ? fmtDur(v) : "", "num"));
    });
    table.append(tr);
  }
  const foot = el("tr");
  foot.append(el("th", "Total"));
  totals.forEach((v) => foot.append(el("th", v ? fmtDur(v) : "", "num")));
  table.append(foot);
  $("#week").replaceChildren(allSites.length ? table : el("p", "No data yet.", "muted"));

  // Reasons
  const rt = el("table");
  const rh = el("tr");
  for (const h of ["Time", "Site", "Min", "Reason"]) rh.append(el("th", h));
  rt.append(rh);
  for (const r of reasons.slice(-100).reverse()) {
    const tr = el("tr");
    tr.append(
      el("td", new Date(r.ts).toLocaleString()),
      el("td", r.site),
      el("td", r.minutes ? String(r.minutes) : "", "num"),
      el("td", r.reason)
    );
    rt.append(tr);
  }
  $("#reasons").replaceChildren(reasons.length ? rt : el("p", "Nothing logged yet.", "muted"));

  renderCharts(usage);
}

$("#add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = normalizeSite($("#add-input").value);
  if (!d) {
    $("#add-msg").textContent = "Not a valid domain or address.";
    return;
  }
  const { sites = [] } = await browser.storage.local.get("sites");
  if (!sites.includes(d)) await browser.storage.local.set({ sites: [...sites, d].sort() });
  $("#add-input").value = "";
  $("#add-msg").textContent = "";
  render();
});

$("#save").addEventListener("click", async () => {
  const settings = {};
  for (const k of Object.keys(DEFAULTS)) {
    const v = Number($("#" + k).value);
    settings[k] = Number.isFinite(v) && v >= 0 ? v : DEFAULTS[k];
  }
  await browser.storage.local.set({ settings });
  $("#save-msg").textContent = "Saved.";
  setTimeout(() => ($("#save-msg").textContent = ""), 2000);
});

$("#clear").addEventListener("click", async () => {
  if (confirm("Delete all recorded usage and reasons?")) {
    await browser.storage.local.set({ usage: {}, reasons: [], nudged: {} });
    await browser.storage.local.remove("nudge");
    render();
  }
});

render();
