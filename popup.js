(async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const domain = tab && tab.url ? normalizeDomain(tab.url) : null;
  const label = document.getElementById("domain");
  const btn = document.getElementById("toggle");
  const today = document.getElementById("today");

  async function render() {
    const { sites = [], usage = {} } = await browser.storage.local.get(["sites", "usage"]);
    const t = usage[dayKey()] || {};
    const total = Object.values(t).reduce((a, b) => a + b, 0);
    today.textContent = `Today on listed sites: ${fmtDur(total)}`;
    if (!domain) {
      label.textContent = "This page cannot be added.";
      btn.disabled = true;
      btn.textContent = "Add";
      return;
    }
    const matched = tab && tab.url ? matchSite(tab.url, sites) : null;
    const entry = matched || domain;
    const listed = !!matched;
    label.textContent = entry;
    btn.disabled = false;
    btn.textContent = listed ? "Remove from list" : "Add to list";
    btn.onclick = async () => {
      const next = listed ? sites.filter((s) => s !== entry) : [...sites, entry].sort();
      await browser.storage.local.set({ sites: next });
      render();
    };
  }
  document.getElementById("options").onclick = () => {
    browser.runtime.openOptionsPage();
    window.close();
  };
  render();
})();
