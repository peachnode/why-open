// Page overlays: (1) a corner countdown for the whole session (it turns urgent in the last LEAD seconds),
// (2) a dimmed check-in card when combined time today crosses the set limit.
// Styles are set through the CSSOM (no <style> tags), so strict page CSPs do not block them.
(() => {
  const LEAD = 30;
  const NUDGE_DELAY = 10; // seconds until "Keep going" unlocks

  const style = (el, o) => Object.assign(el.style, o);
  const mk = (tag, o, text) => {
    const e = document.createElement(tag);
    if (o) style(e, o);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const FONT = "14px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  // --- 1. Corner countdown ---------------------------------------------------
  let timer = 0;
  let tickId = 0;
  let host = null;
  let parts = null;
  let dismissedStart = null;

  function build() {
    host = mk("div", { all: "initial", position: "fixed", right: "20px", bottom: "20px", zIndex: "2147483646" });
    const root = host.attachShadow({ mode: "closed" });
    const card = mk("div", {
      width: "264px", boxSizing: "border-box", padding: "16px 18px", borderRadius: "20px",
      background: "rgba(255,255,255,.96)", border: "1px solid #e8e6f2", color: "#383d5c",
      boxShadow: "0 12px 40px rgba(102,115,201,.22), 0 2px 6px rgba(102,115,201,.12)", font: FONT,
    });
    const head = mk("div", { display: "flex", justifyContent: "space-between", alignItems: "center" });
    const title = mk("span", { fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#8a90c9", fontWeight: "600" }, "Time left");
    head.append(title);
    const close = mk("button", {
      all: "unset", cursor: "pointer", color: "#a3a8c2", fontSize: "16px", lineHeight: "1", padding: "2px 6px", borderRadius: "999px",
    }, "×");
    close.title = "Hide";
    close.addEventListener("click", () => {
      // Hidden until the final seconds, when it comes back on its own.
      dismissedStart = parts.start;
      hide();
      clearTimeout(timer);
      timer = setTimeout(evaluate, Math.max(0, parts.until - Date.now() - LEAD * 1000));
    });
    head.append(close);
    const count = mk("div", { fontSize: "30px", fontWeight: "500", margin: "6px 0 2px", fontVariantNumeric: "tabular-nums", color: "#5d6abf", transition: "color .6s" }, "");
    const reason = mk("div", { fontSize: "13px", color: "#8187a3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
    const track = mk("div", { height: "4px", borderRadius: "999px", background: "#edecf7", marginTop: "12px", overflow: "hidden" });
    const bar = mk("div", { height: "100%", width: "100%", borderRadius: "999px", background: "linear-gradient(90deg,#9aa5e8,#6673c9)", transformOrigin: "left center" });
    track.append(bar);
    card.append(head, count, reason, track);
    root.append(card);
    parts = { count, title, reason, bar, card, start: 0, until: 0, minutes: 1 };
  }

  function update() {
    const left = parts.until - Date.now();
    if (left <= 0) {
      hide();
      return;
    }
    const s = Math.ceil(left / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
    if (parts.count.textContent !== text) parts.count.textContent = text;
    const total = Math.max(1, parts.minutes * 60000);
    parts.bar.style.transform = `scaleX(${Math.min(1, left / total).toFixed(4)})`;
    const urgent = left <= LEAD * 1000;
    if (urgent !== parts.urgent) {
      parts.urgent = urgent;
      parts.title.textContent = urgent ? "Time is almost up" : "Time left";
      parts.count.style.color = urgent ? "#c4616a" : "#5d6abf";
    }
  }

  function show(sess) {
    if (dismissedStart === sess.start && sess.until - Date.now() > LEAD * 1000) return;
    if (!host) build();
    parts.start = sess.start;
    parts.until = sess.until;
    parts.minutes = sess.minutes || 1;
    parts.reason.textContent = sess.reason ? `For: ${sess.reason}` : "";
    if (!host.isConnected) {
      (document.body || document.documentElement).append(host);
      parts.card.animate(
        [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
        { duration: 450, easing: "ease-out" }
      );
    }
    update();
    clearInterval(tickId);
    tickId = setInterval(update, 500);
  }

  function hide() {
    clearInterval(tickId);
    if (host && host.isConnected) host.remove();
  }

  // --- 2. Check-in card ------------------------------------------------------
  let nHost = null;
  let nOpening = false;
  let nTimer = 0;
  let pausedMedia = [];
  let prevOverflow = null;

  async function showNudge() {
    if (nOpening || (nHost && nHost.isConnected)) return;
    nOpening = true;
    try {
      const { usage = {} } = await browser.storage.local.get("usage");
      const entries = Object.entries(usage[dayKey()] || {}).sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((a, [, v]) => a + v, 0);
      const max = entries.length ? entries[0][1] : 1;

      nHost = mk("div", { all: "initial", position: "fixed", top: "0", left: "0", right: "0", bottom: "0", zIndex: "2147483647" });
      const root = nHost.attachShadow({ mode: "closed" });
      const overlay = mk("div", {
        position: "absolute", top: "0", left: "0", right: "0", bottom: "0", display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(56,61,92,.42)", backdropFilter: "blur(10px)", font: FONT, color: "#383d5c",
      });
      overlay.style.webkitBackdropFilter = "blur(10px)";
      const card = mk("div", {
        width: "min(440px, calc(100vw - 32px))", boxSizing: "border-box", padding: "32px 32px 28px", borderRadius: "28px",
        background: "#fff", boxShadow: "0 30px 80px rgba(56,61,92,.35)", maxHeight: "calc(100vh - 32px)", overflowY: "auto",
      });
      card.append(
        mk("div", { fontSize: "11px", letterSpacing: ".12em", textTransform: "uppercase", color: "#8a90c9", fontWeight: "600" }, "A gentle check-in"),
        mk("div", { fontSize: "42px", fontWeight: "500", color: "#5d6abf", margin: "8px 0 0", lineHeight: "1.15" }, fmtDur(total)),
        mk("div", { color: "#8187a3", marginBottom: "18px" }, "on your listed sites today")
      );
      for (const [site, secs] of entries.slice(0, 4)) {
        const row = mk("div", { marginBottom: "10px" });
        const line = mk("div", { display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" });
        line.append(mk("span", null, site), mk("span", { color: "#8187a3" }, fmtDur(secs)));
        const track = mk("div", { height: "5px", borderRadius: "999px", background: "#edecf7", overflow: "hidden" });
        track.append(mk("div", { height: "100%", width: `${Math.max(4, (secs / max) * 100)}%`, borderRadius: "999px", background: "linear-gradient(90deg,#b5bdf2,#7d89d8)" }));
        row.append(line, track);
        card.append(row);
      }
      card.append(mk("div", { fontSize: "18px", fontWeight: "500", margin: "22px 0 16px" }, "Is this still what you wanted?"));

      const btns = mk("div", { display: "flex", gap: "10px", flexWrap: "wrap" });
      const brk = mk("button", {
        all: "unset", boxSizing: "border-box", cursor: "pointer", padding: "12px 22px", borderRadius: "999px", fontWeight: "500", color: "#fff",
        background: "linear-gradient(135deg,#7d89d8,#6673c9)", boxShadow: "0 6px 16px rgba(102,115,201,.35)", font: FONT,
      }, "Take a break");
      brk.style.fontWeight = "500";
      const keep = mk("button", {
        all: "unset", boxSizing: "border-box", cursor: "not-allowed", padding: "12px 22px", borderRadius: "999px", color: "#8187a3",
        border: "1px solid #e1def0", opacity: ".6", font: FONT,
      }, `Keep going (${NUDGE_DELAY})`);
      btns.append(brk, keep);
      card.append(btns);
      overlay.append(card);
      root.append(overlay);

      // Quiet the page: pause playing media and stop scrolling.
      pausedMedia = [...document.querySelectorAll("video, audio")].filter((m) => !m.paused);
      pausedMedia.forEach((m) => m.pause());
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";

      (document.body || document.documentElement).append(nHost);
      overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "ease-out" });
      card.animate(
        [{ opacity: 0, transform: "translateY(14px) scale(.98)" }, { opacity: 1, transform: "none" }],
        { duration: 500, easing: "ease-out" }
      );
      brk.setAttribute("tabindex", "0");
      keep.setAttribute("tabindex", "0");
      setTimeout(() => brk.focus(), 50);

      let left = NUDGE_DELAY;
      let unlocked = false;
      clearInterval(nTimer);
      nTimer = setInterval(() => {
        left -= 1;
        if (left > 0) {
          keep.textContent = `Keep going (${left})`;
          return;
        }
        clearInterval(nTimer);
        unlocked = true;
        keep.textContent = "Keep going";
        style(keep, { cursor: "pointer", opacity: "1", color: "#5d6abf", borderColor: "#b9c0ee" });
      }, 1000);

      brk.addEventListener("click", () => {
        pausedMedia = [];
        browser.runtime.sendMessage({ type: "closeTab" });
      });
      keep.addEventListener("click", () => {
        if (!unlocked) return;
        browser.storage.local.remove("nudge");
        hideNudge();
      });
      // Keep keyboard focus inside the card.
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          (root.activeElement === brk && unlocked ? keep : brk).focus();
        }
        e.stopPropagation();
      });
    } finally {
      nOpening = false;
    }
  }

  function hideNudge() {
    clearInterval(nTimer);
    if (nHost && nHost.isConnected) {
      nHost.remove();
      document.documentElement.style.overflow = prevOverflow || "";
      pausedMedia.forEach((m) => m.play && m.play().catch(() => {}));
      pausedMedia = [];
    }
  }

  // --- Decide what to show ---------------------------------------------------
  async function evaluate() {
    clearTimeout(timer);
    let data;
    try {
      data = await browser.storage.local.get(["sites", "sessions", "nudge"]);
    } catch {
      return;
    }
    const site = matchSite(location.href, data.sites || []);
    if (!site) {
      hide();
      hideNudge();
      return;
    }

    const n = data.nudge;
    if (n && n.day === dayKey() && !document.hidden) showNudge();
    else hideNudge();

    const sess = (data.sessions || {})[site];
    const left = sess && sess.until ? sess.until - Date.now() : 0;
    if (!sess || left <= 0) {
      hide();
    } else {
      show(sess);
    }
  }

  browser.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && (ch.sessions || ch.sites || ch.nudge)) evaluate();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) evaluate();
  });
  // Single-page sites change the address without a page load: re-check when it changes.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      evaluate();
    }
  }, 1000);
  evaluate();
})();
