// Dashboard charts: one donut for the chosen time frame, and a line that adds up the
// time site by site (biggest first). Plain SVG, nothing outside the extension is loaded.
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["#6673c9", "#e8907c", "#56b3a0", "#e2b04a", "#a47fc8", "#68a8dc", "#dc7fa4", "#8fbf6a", "#7f8fa6", "#c98f5f"];
  const OTHER = "#cfd2e3";
  const ACCENT = "#6673c9";
  const FRAMES = [["today", "Today", "today"], ["7", "7 days", "the last 7 days"], ["30", "30 days", "the last 30 days"], ["all", "All time", "all time"]];
  const state = { frame: "7", range: "7", mode: "total" };
  let usage = {};

  const s = (tag, attrs = {}, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const h = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const $ = (id) => document.getElementById(id);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  const parseKey = (k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const keyBack = (i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return dayKey(d);
  };
  const lastKeys = (n) => Array.from({ length: n }, (_, i) => keyBack(i));
  function sumDays(keys) {
    const out = {};
    for (const k of keys) for (const [name, v] of Object.entries(usage[k] || {})) out[name] = (out[name] || 0) + v;
    return out;
  }
  function short(sec) {
    sec = Math.round(sec);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    if (hh > 0) return `${hh}h ${String(mm).padStart(2, "0")}m`;
    if (sec > 0 && sec < 60) return `${sec}s`;
    return `${mm} min`;
  }
  const dur = (v) => (v >= 1 ? fmtDur(v) : "–");
  const pct = (f) => (f < 0.005 ? "<1%" : `${Math.round(f * 100)}%`);
  const fmtAxis = (v) => (v === 0 ? "0" : v < 3600 ? `${Math.round(v / 60)} min` : `${+(v / 3600).toFixed(1)} h`);

  // The days that belong to the chosen time frame.
  function frameKeys() {
    const f = state.frame;
    if (f === "today") return lastKeys(1);
    if (f === "7") return lastKeys(7);
    if (f === "30") return lastKeys(30);
    const all = Object.keys(usage).sort();
    if (!all.length) return lastKeys(1);
    const span = Math.round((parseKey(keyBack(0)) - parseKey(all[0])) / 864e5) + 1;
    return lastKeys(Math.min(Math.max(span, 1), 3650));
  }

  // The same site keeps the same colour in every chart (ranked by all-time use).
  function colorMap() {
    const ranked = Object.entries(sumDays(Object.keys(usage))).sort((a, b) => b[1] - a[1]);
    const map = {};
    ranked.forEach(([name], i) => (map[name] = i < PALETTE.length ? PALETTE[i] : OTHER));
    return map;
  }

  // --- Time frame selector ------------------------------------------------------------
  function controls() {
    const wrap = h("div", "seg");
    for (const [value, label] of FRAMES) {
      const b = h("button", state.frame === value ? "active" : "", label);
      b.type = "button";
      b.addEventListener("click", () => {
        state.frame = value;
        renderAll();
      });
      wrap.append(b);
    }
    $("frameControls").replaceChildren(wrap);
  }

  // --- Tiles --------------------------------------------------------------------------
  function tiles(keys, totals) {
    const total = sum(totals);
    const tracked = keys.filter((k) => sum(usage[k] || {}) >= 1).length;
    const items = [
      ["Total", dur(total), "in this period"],
      ["Daily average", tracked ? dur(total / tracked) : "–", "tracked days only"],
      ["Days tracked", `${tracked} of ${keys.length}`, "days with any time"],
    ];
    const box = $("tiles");
    box.replaceChildren();
    for (const [k, v, n] of items) {
      const t = h("div", "tile");
      t.append(h("div", "k", k), h("div", "v", v), h("div", "n", n));
      box.append(t);
    }
  }

  // --- Donut --------------------------------------------------------------------------
  function donut(label, entries, colors) {
    const total = entries.reduce((a, [, v]) => a + v, 0);
    const keep = entries.length > 9 ? 8 : entries.length;
    const slices = entries.slice(0, keep).map(([name, v]) => ({ name, v, color: colors[name] || OTHER }));
    if (entries.length > keep) {
      const rest = entries.slice(keep);
      slices.push({ name: `${rest.length} other sites`, v: rest.reduce((a, [, v]) => a + v, 0), color: OTHER });
    }

    const R = 72;
    const C = 2 * Math.PI * R;
    const svg = s("svg", { viewBox: "0 0 200 200", role: "img", "aria-label": `Time per site, ${label}: ${total ? short(total) : "nothing recorded"}` });
    svg.append(s("circle", { cx: 100, cy: 100, r: R, fill: "none", stroke: "#f1f0f9", "stroke-width": 26 }));
    let offset = 0;
    for (const sl of slices) {
      const len = (sl.v / total) * C;
      const gap = slices.length > 1 ? Math.min(2.5, len * 0.5) : 0;
      const c = s("circle", {
        cx: 100, cy: 100, r: R, fill: "none", stroke: sl.color, "stroke-width": 26,
        "stroke-dasharray": `${Math.max(0.01, len - gap).toFixed(2)} ${C.toFixed(2)}`,
        "stroke-dashoffset": (-offset).toFixed(2), transform: "rotate(-90 100 100)", class: "slice",
      });
      c.append(s("title", {}, `${sl.name}: ${fmtDur(sl.v)} (${pct(sl.v / total)})`));
      svg.append(c);
      offset += len;
    }
    svg.append(s("text", { x: 100, y: 104, "text-anchor": "middle", "font-size": 21, "font-weight": 600, fill: "#4a4f74" }, total ? short(total) : "–"));
    svg.append(s("text", { x: 100, y: 124, "text-anchor": "middle", "font-size": 11, fill: "#8187a3" }, total ? "total" : "no data"));

    const legend = h("div", "legend");
    if (!slices.length) legend.append(h("div", "muted", "Nothing recorded in this period."));
    for (const sl of slices) {
      const row = h("div", "lrow");
      const dot = h("span", "dot");
      dot.style.background = sl.color;
      row.append(dot, h("span", "nm", sl.name), h("span", "tm", short(sl.v)), h("span", "pc", pct(sl.v / total)));
      row.title = sl.name;
      legend.append(row);
    }
    $("donut").replaceChildren(svg, legend);
  }

  // --- Line chart: time per day (7 / 30 days), or average per day by week (year) ----------------
  const RANGES = [["7", "7 days"], ["30", "30 days"], ["year", "Year"]];
  const MODES = [["total", "Total"], ["site", "By site"]];
  const md = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function niceTicks(max) {
    const steps = [60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 14400, 21600, 43200, 86400];
    const step = steps.find((x) => max / x <= 5) || 86400 * Math.ceil(max / 86400 / 5);
    const top = Math.max(1, Math.ceil(max / step)) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-6; v += step) ticks.push(v);
    return { top, ticks };
  }

  // One entry per point: { per: {site: seconds}, date, end?, days? }
  function linePoints() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (state.range === "year") {
      // 52 weeks (Monday to Sunday) ending with this week. The value is the week's total
      // divided by all its days, so days without tracking count as zero. This week only
      // counts the days that have happened so far.
      const monday = new Date(today);
      monday.setDate(monday.getDate() - ((today.getDay() + 6) % 7));
      return Array.from({ length: 52 }, (_, w) => {
        const start = new Date(monday);
        start.setDate(start.getDate() - (51 - w) * 7);
        const per = {};
        let days = 0;
        for (let d = 0; d < 7; d++) {
          const day = new Date(start);
          day.setDate(day.getDate() + d);
          if (day > today) break;
          days++;
          for (const [name, v] of Object.entries(usage[dayKey(day)] || {})) per[name] = (per[name] || 0) + v;
        }
        for (const name of Object.keys(per)) per[name] /= days;
        const end = new Date(start);
        end.setDate(end.getDate() + days - 1);
        return { per, date: start, end, days };
      });
    }
    const n = state.range === "7" ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (n - 1 - i));
      return { per: { ...(usage[dayKey(date)] || {}) }, date };
    });
  }

  function lineControls() {
    const seg = (items, key) => {
      const wrap = h("div", "seg");
      for (const [value, label] of items) {
        const b = h("button", state[key] === value ? "active" : "", label);
        b.type = "button";
        b.addEventListener("click", () => {
          state[key] = value;
          lineView(colorMap());
        });
        wrap.append(b);
      }
      return wrap;
    };
    $("lineControls").replaceChildren(seg(RANGES, "range"), seg(MODES, "mode"));
  }

  function lineView(colors) {
    lineControls();
    const week = state.range === "year";
    $("lineTitle").textContent = week ? "Average per day, by week" : "Time per day";
    const box = $("lineBox");
    const legend = $("lineLegend");
    box.replaceChildren();
    legend.replaceChildren();

    const pts = linePoints();
    const n = pts.length;
    const totals = pts.map((p) => sum(p.per));
    let series;
    if (state.mode === "total") {
      series = [{ name: "Total", color: ACCENT, vals: totals }];
    } else {
      const tot = {};
      for (const p of pts) for (const [name, v] of Object.entries(p.per)) tot[name] = (tot[name] || 0) + v;
      const ranked = Object.entries(tot).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
      const top = ranked.slice(0, 6).map(([name]) => name);
      series = top.map((name) => ({ name, color: colors[name] || OTHER, vals: pts.map((p) => p.per[name] || 0) }));
      if (ranked.length > 6) {
        const set = new Set(top);
        series.push({ name: "Other", color: OTHER, vals: pts.map((p) => Object.entries(p.per).reduce((a, [nm, v]) => (set.has(nm) ? a : a + v), 0)) });
      }
    }
    const max = Math.max(0, ...series.flatMap((sr) => sr.vals));
    if (max < 1) {
      box.append(h("p", "empty", "No time recorded in this period."));
      return;
    }

    const W = 720, H = 300, M = { l: 58, r: 22, t: 16, b: 34 };
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const { top, ticks } = niceTicks(max);
    const X = (i) => M.l + (n === 1 ? pw / 2 : (i * pw) / (n - 1));
    const Y = (v) => M.t + ph - (v / top) * ph;
    const root = s("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": week ? "Average time per day, by week" : "Time per day" });
    const defs = s("defs");
    const grad = s("linearGradient", { id: "areaFill", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(s("stop", { offset: "0", "stop-color": ACCENT, "stop-opacity": ".26" }), s("stop", { offset: "1", "stop-color": ACCENT, "stop-opacity": "0" }));
    defs.append(grad);
    root.append(defs);

    for (const t of ticks) {
      root.append(s("line", { x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t), stroke: "#ece9f6", "stroke-width": 1 }));
      root.append(s("text", { x: M.l - 10, y: Y(t) + 4, "text-anchor": "end", "font-size": 11, fill: "#8187a3" }, fmtAxis(t)));
    }
    const m = n <= 7 ? n : 6;
    const idxs = [...new Set(Array.from({ length: m }, (_, k) => (m === 1 ? 0 : Math.round((k * (n - 1)) / (m - 1)))))];
    for (const i of idxs) {
      const d = pts[i].date;
      const text = n <= 7 ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }) : md(d);
      const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      root.append(s("text", { x: X(i), y: H - 10, "text-anchor": anchor, "font-size": 11, fill: "#8187a3" }, text));
    }

    const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
    if (state.mode === "total") {
      root.append(s("path", { d: `${path(series[0].vals)} L${X(n - 1).toFixed(1)},${Y(0)} L${X(0).toFixed(1)},${Y(0)} Z`, fill: "url(#areaFill)" }));
    }
    for (const sr of [...series].reverse()) {
      root.append(s("path", { d: path(sr.vals), fill: "none", stroke: sr.color, "stroke-width": state.mode === "total" ? 2.8 : 2.2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (state.mode === "total" && n <= 14) sr.vals.forEach((v, i) => root.append(s("circle", { cx: X(i), cy: Y(v), r: 3.8, fill: sr.color, stroke: "#fff", "stroke-width": 1.5 })));
    }

    const vline = s("line", { y1: M.t, y2: M.t + ph, stroke: "#b9bde0", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
    const dots = series.map((sr) => s("circle", { r: 4.8, fill: sr.color, stroke: "#fff", "stroke-width": 2, visibility: "hidden" }));
    const overlay = s("rect", { x: M.l, y: M.t, width: pw, height: ph + 24, fill: "transparent" });
    root.append(vline, ...dots, overlay);
    box.append(root);

    const tip = h("div", "tip");
    tip.style.display = "none";
    box.append(tip);
    const row = (label, value, color, strong) => {
      const r = h("div", "r");
      const l = h("span", "l");
      if (color) {
        const dot = h("span", "dot");
        dot.style.background = color;
        l.append(dot);
      }
      l.append(document.createTextNode(label));
      r.append(l, h("span", strong ? "v strong" : "v", value));
      return r;
    };
    overlay.addEventListener("pointermove", (ev) => {
      const r = root.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, n === 1 ? 0 : Math.round(((px - M.l) / pw) * (n - 1))));
      const p = pts[i];
      vline.setAttribute("x1", X(i));
      vline.setAttribute("x2", X(i));
      vline.setAttribute("visibility", "visible");
      dots.forEach((d, k) => {
        d.setAttribute("cx", X(i));
        d.setAttribute("cy", Y(series[k].vals[i]));
        d.setAttribute("visibility", "visible");
      });
      const head = week
        ? `${md(p.date)} – ${md(p.end)}${p.days < 7 ? " (so far)" : ""}`
        : p.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      tip.replaceChildren(h("b", null, head), row(week ? "Daily average" : "Total that day", dur(totals[i]), null, true));
      const rows = state.mode === "total"
        ? Object.entries(p.per).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([name, v]) => [name, v, colors[name] || OTHER])
        : series.map((sr) => [sr.name, sr.vals[i], sr.color]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
      const keep = state.mode === "site" ? rows.length : 6;
      for (const [name, v, color] of rows.slice(0, keep)) tip.append(row(name, dur(v), color));
      const rest = rows.slice(keep).reduce((a, x) => a + x[1], 0);
      if (rest >= 1) tip.append(row("Others", dur(rest), OTHER));
      tip.style.display = "block";
      tip.style.left = `${(X(i) / W) * r.width}px`;
      tip.style.transform = X(i) / W > 0.55 ? "translateX(calc(-100% - 14px))" : "translateX(14px)";
    });
    overlay.addEventListener("pointerleave", () => {
      vline.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
      tip.style.display = "none";
    });

    if (state.mode === "site") {
      for (const sr of series) {
        const item = h("span", "item");
        const dot = h("span", "dot");
        dot.style.background = sr.color;
        item.append(dot, document.createTextNode(sr.name));
        legend.append(item);
      }
    }
  }

  // --- Entry point ----------------------------------------------------------------------
  function renderAll() {
    const frame = FRAMES.find((f) => f[0] === state.frame);
    const keys = frameKeys();
    const totals = sumDays(keys);
    const entries = Object.entries(totals).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]);
    const colors = colorMap();
    controls();
    tiles(keys, totals);
    donut(frame[2], entries, colors);
    lineView(colors);
  }
  window.renderCharts = (u) => {
    usage = u || {};
    renderAll();
  };

  // Keep the charts current while the dashboard stays open (at most every 10 s).
  let last = 0;
  browser.storage.onChanged.addListener((ch, area) => {
    if (area !== "local" || !ch.usage || document.hidden || Date.now() - last < 10000) return;
    last = Date.now();
    usage = ch.usage.newValue || {};
    renderAll();
  });
})();
