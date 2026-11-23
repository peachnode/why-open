// breathCycles: number of full breaths (4 s in, 6 s out = 10 s each) before Continue unlocks; 0 turns it off.
// limitMinutes: a check-in appears at every multiple of this much combined active time per day; 0 turns it off.
const DEFAULTS = { breathCycles: 3, defaultMinutes: 10, limitMinutes: 30 };
const BREATH_IN = 4;
const BREATH_OUT = 6;

// A session's time only runs while you are actually on the site (tab in front, window
// focused, not idle). Leaving pauses it; the rest is lost after this long away.
const AWAY_LIMIT_MS = 60 * 60 * 1000;
function sessionLeft(sess, now = Date.now()) {
  if (!sess) return 0;
  if (sess.until) return Math.max(0, sess.until - now); // running
  if (sess.pausedAt && now - sess.pausedAt > AWAY_LIMIT_MS) return 0; // paused too long
  return Math.max(0, sess.left || 0);
}

function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function normalizeDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  try {
    s = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : "https://" + s).hostname;
  } catch {
    return null;
  }
  s = s.replace(/^www\./, "");
  return /^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(s) ? s : null;
}

// A list entry is "domain" (also covers its subdomains), "sub.domain", or "domain/path"
// (that path and everything below it). The most specific matching entry wins.
function normalizeSite(input) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  let u;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : "https://" + s);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z0-9-]{2,}$/.test(host)) return null;
  return host + u.pathname.replace(/\/+$/, "");
}

function matchSite(url, sites) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "").toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const entry of sites) {
    const i = entry.indexOf("/");
    const eh = i < 0 ? entry : entry.slice(0, i);
    const ep = i < 0 ? "" : entry.slice(i);
    if (host !== eh && !host.endsWith("." + eh)) continue;
    if (ep && path !== ep && !path.startsWith(ep + "/")) continue;
    const score = eh.length * 10000 + ep.length;
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

function fmtDur(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
