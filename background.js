const INTERSTITIAL = browser.runtime.getURL("interstitial.html");
const get = (k) => browser.storage.local.get(k);
const gateUrl = (url, site) => `${INTERSTITIAL}?u=${encodeURIComponent(url)}&s=${encodeURIComponent(site)}`;

let queue = Promise.resolve();
function serial(fn) {
  const r = queue.then(fn);
  queue = r.catch(() => {});
  return r;
}

// --- Interception -----------------------------------------------------------
// A site is open only while its session (chosen duration) has not run out.
// Exception: a page opened straight from a Google search result gets a free pass
// (also for reloads of that same page). Any link followed from there is gated.
const isGoogleSearch = (u) => {
  try {
    return /^(www\.)?google\.[a-z.]{2,}$/i.test(new URL(u).hostname);
  } catch {
    return false;
  }
};

const pagePath = (u) => {
  try {
    const x = new URL(u);
    return x.origin + x.pathname.replace(/\/+$/, "");
  } catch {
    return u;
  }
};

browser.webRequest.onBeforeRequest.addListener(
  async (d) => {
    const { sites = [], sessions = {}, free = {} } = await get(["sites", "sessions", "free"]);
    const site = matchSite(d.url, sites);
    if (!site) return {};
    const sess = sessions[site];
    if (sessionLeft(sess) > 0) return {};
    const reload = d.tabId >= 0 && free[d.tabId] && free[d.tabId].url === d.url;
    if (reload || isGoogleSearch(d.originUrl || d.documentUrl || "")) {
      if (d.tabId >= 0 && !reload) {
        free[d.tabId] = { url: d.url, path: pagePath(d.url), ts: Date.now() };
        await browser.storage.local.set({ free });
      }
      return {};
    }
    return { redirectUrl: gateUrl(d.url, site) };
  },
  { urls: ["<all_urls>"], types: ["main_frame"] },
  ["blocking"]
);

// Single-page sites (Reddit, YouTube, ...) change pages without a new request, so
// webRequest never sees a click on a link. Catch those URL changes here and send the
// tab to the gate unless it is still on the page that got the free pass.
browser.tabs.onUpdated.addListener(async (tabId, ch) => {
  if (!ch.url) return;
  const { sites = [], sessions = {}, free = {} } = await get(["sites", "sessions", "free"]);
  const site = matchSite(ch.url, sites);
  if (!site) return;
  const sess = sessions[site];
  if (sessionLeft(sess) > 0) return;
  const f = free[tabId];
  if (f && (Date.now() - f.ts < 2500 || pagePath(ch.url) === f.path)) return;
  browser.tabs.update(tabId, { url: gateUrl(ch.url, site) });
});

browser.tabs.onRemoved.addListener((id) =>
  serial(async () => {
    const { free = {} } = await get("free");
    if (id in free) {
      delete free[id];
      await browser.storage.local.set({ free });
    }
  })
);

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === "closeTab" && sender.tab) {
    browser.storage.local.remove("nudge");
    browser.tabs.remove(sender.tab.id);
    return;
  }
  if (!msg || msg.type !== "allow") return;
  return serial(async () => {
    const { sites = [], sessions = {}, reasons = [] } = await get(["sites", "sessions", "reasons"]);
    const site = matchSite(msg.url, sites);
    const reason = String(msg.reason || "").trim();
    const minutes = Math.min(Math.max(Math.round(Number(msg.minutes)), 1), 240);
    if (!site || reason.length < 3 || !Number.isFinite(minutes)) return { ok: false };
    const now = Date.now();
    const u = new URL(msg.url);
    // Starts paused; the clock begins when the page is actually in front of you.
    sessions[site] = { start: now, minutes, reason, left: minutes * 60000, until: null, pausedAt: now, handled: false };
    reasons.push({ ts: now, site, url: u.origin + u.pathname, reason, minutes });
    // Getting new time here ends whatever time was left on any other listed site.
    const ended = [];
    for (const [name, other] of Object.entries(sessions)) {
      if (name === site || sessionLeft(other, now) <= 0) continue;
      other.left = 0;
      other.until = null;
      other.pausedAt = now;
      other.handled = true;
      browser.alarms.clear(`expire:${name}`);
      ended.push(name);
    }
    await browser.storage.local.set({ sessions, reasons: reasons.slice(-2000) });
    // Tabs still open on those sites go back to the gate, like when time runs out.
    if (ended.length) {
      for (const t of await browser.tabs.query({})) {
        const name = t.url && matchSite(t.url, ended);
        if (name) browser.tabs.update(t.id, { url: gateUrl(t.url, name) });
      }
    }
    return { ok: true };
  });
});

// Time is up for a running session: send every open tab of that site back to the gate.
function checkExpired() {
  return serial(async () => {
    const { sites = [], sessions = {} } = await get(["sites", "sessions"]);
    const now = Date.now();
    let changed = false;
    for (const [site, sess] of Object.entries(sessions)) {
      if (!sess.until || sess.handled || now < sess.until) continue;
      sess.handled = true;
      sess.left = 0;
      sess.until = null;
      sess.pausedAt = now;
      changed = true;
      browser.alarms.clear(`expire:${site}`);
      if (!sites.includes(site)) continue;
      for (const t of await browser.tabs.query({})) {
        if (t.url && matchSite(t.url, [site])) browser.tabs.update(t.id, { url: gateUrl(t.url, site) });
      }
    }
    if (changed) await browser.storage.local.set({ sessions });
  });
}

// --- Time tracking ----------------------------------------------------------
// The listed site you are really on: its tab is in front, its window is focused, and you
// are not away from the keyboard (a tab that is playing sound keeps counting while idle).
const IDLE_SEC = 120;
async function currentSite() {
  const w = await browser.windows.getLastFocused();
  if (!w.focused) return null;
  const [t] = await browser.tabs.query({ active: true, windowId: w.id });
  if (!t || !t.url) return null;
  const idle = await browser.idle.queryState(IDLE_SEC);
  if (idle === "locked" || (idle === "idle" && !t.audible)) return null;
  const { sites = [] } = await get("sites");
  return matchSite(t.url, sites);
}

// Combined-time check-in: whenever today's total crosses another multiple of
// limitMinutes, store a "nudge" that visible listed pages turn into a popup.
async function checkLimit(usage, now) {
  const { settings, nudged = {} } = await get(["settings", "nudged"]);
  const limit = Number({ ...DEFAULTS, ...settings }.limitMinutes);
  if (!(limit > 0)) return;
  const day = dayKey();
  const total = Object.values(usage[day] || {}).reduce((a, b) => a + b, 0);
  const thr = Math.floor(total / (limit * 60));
  if (thr > (nudged[day] || 0)) {
    await browser.storage.local.set({ nudged: { [day]: thr }, nudge: { id: now, day, thr } });
  }
}

function updateBadge(usage) {
  const total = Object.values(usage[dayKey()] || {}).reduce((a, b) => a + b, 0);
  const m = Math.floor(total / 60);
  const text = m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color: "#444444" });
}

// One clock for everything: the time you are really on a listed site counts toward
// today's total and, at the same time, runs down that site's session.
function tick() {
  return serial(async () => {
    const now = Date.now();
    const { cur, usage = {}, sessions = {} } = await get(["cur", "usage", "sessions"]);

    // 1. Close the running segment. It is capped at 150 s, so a sleeping laptop or a
    //    long gap between events never counts as time on the page.
    if (cur && cur.site) {
      const ms = Math.min(Math.max(0, now - cur.since), 150000);
      const day = dayKey();
      usage[day] = usage[day] || {};
      usage[day][cur.site] = (usage[day][cur.site] || 0) + ms / 1000;
      const s = sessions[cur.site];
      if (s && s.until) {
        if (s.left == null) s.left = Math.max(0, s.until - cur.since);
        s.left = Math.max(0, s.left - ms);
        s.until = now + s.left;
      }
    }

    // 2. Where are you now? Freeze sessions you left, wake the one you came back to.
    const site = await currentSite();
    for (const [name, s] of Object.entries(sessions)) {
      if (s.until && name !== site && s.until > now) {
        s.until = null;
        s.pausedAt = now;
        browser.alarms.clear(`expire:${name}`);
      } else if (!s.until && name === site && sessionLeft(s, now) > 0) {
        s.until = now + (s.left || 0);
        s.pausedAt = null;
        s.handled = false;
      }
    }
    const act = site && sessions[site];
    if (act && act.until && !act.handled) browser.alarms.create(`expire:${site}`, { when: act.until + 500 });

    await browser.storage.local.set({ usage, sessions, cur: site ? { site, since: now } : null });
    updateBadge(usage);
    await checkLimit(usage, now);
  });
}

// --- Wiring -----------------------------------------------------------------
async function ensureAlarm(name, period) {
  const a = await browser.alarms.get(name);
  if (!a || a.periodInMinutes !== period) browser.alarms.create(name, { periodInMinutes: period });
}

async function setup() {
  const { settings, sessions = {} } = await get(["settings", "sessions"]);
  await ensureAlarm("tick", 1);
  await browser.alarms.clear("report");
  for (const [site, s] of Object.entries(sessions)) {
    if (!s.handled && s.until > Date.now()) browser.alarms.create(`expire:${site}`, { when: s.until + 500 });
  }
  checkExpired();
  tick();
}

browser.idle.setDetectionInterval(IDLE_SEC);
browser.tabs.onActivated.addListener(tick);
browser.tabs.onUpdated.addListener((id, ch) => ch.url && tick());
browser.windows.onFocusChanged.addListener(tick);
browser.idle.onStateChanged.addListener(tick);
browser.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "tick" || a.name.startsWith("expire:")) {
    await tick();
    await checkExpired();
  }
});
browser.storage.onChanged.addListener((ch, area) => {
  if (area !== "local") return;
  if (ch.settings) setup();
  else if (ch.sites) tick();
});
browser.runtime.onInstalled.addListener(setup);
browser.runtime.onStartup.addListener(setup);
setup();
