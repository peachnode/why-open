(async () => {
  const p = new URLSearchParams(location.search);
  const target = p.get("u");
  const site = p.get("s");
  let valid = false;
  try {
    const u = new URL(target);
    valid = u.protocol === "http:" || u.protocol === "https:";
  } catch {}
  const $ = (id) => document.getElementById(id);
  const reason = $("reason");
  const minutes = $("minutes");
  const next = $("next");
  const go = $("go");
  const status = $("status");
  if (!valid) {
    $("title").textContent = "Invalid target URL";
    return;
  }

  const { settings, sessions = {} } = await browser.storage.local.get(["settings", "sessions"]);
  const s = { ...DEFAULTS, ...settings };
  const prev = sessions[site];
  const cycles = Math.max(0, Math.floor(Number(s.breathCycles) || 0));

  // --- Step 1: reason and time --------------------------------------------
  if (prev && sessionLeft(prev) <= 0) {
    $("title").textContent = `Your time with ${site} has come to an end`;
    $("lead").textContent = "A good moment to pause and see how it went.";
    $("prev").hidden = false;
    $("prevText").textContent = `${prev.reason} (${prev.minutes} min). Did you find what you were looking for?`;
  } else {
    $("title").textContent = `A gentle pause before ${site}`;
  }
  minutes.value = s.defaultMinutes;
  next.textContent = cycles > 0 ? "Continue" : "Continue to site";

  const chips = [...document.querySelectorAll(".chip-btn")];
  function syncChips() {
    chips.forEach((b) => b.classList.toggle("active", b.dataset.m === String(Number(minutes.value))));
  }
  chips.forEach((b) =>
    b.addEventListener("click", () => {
      minutes.value = b.dataset.m;
      refresh1();
    })
  );
  const ready1 = () => reason.value.trim().length >= 3 && Number(minutes.value) >= 1 && Number(minutes.value) <= 240;
  function refresh1() {
    next.disabled = !ready1();
    syncChips();
  }
  reason.addEventListener("input", refresh1);
  minutes.addEventListener("input", refresh1);
  reason.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && ready1()) next.click();
  });
  refresh1();

  $("cancel").addEventListener("click", async () => {
    const t = await browser.tabs.getCurrent();
    browser.tabs.remove(t.id);
  });

  // --- Step 2: breathing ----------------------------------------------------
  // The circle is animated by the browser itself (Web Animations, compositor
  // only). The script just reads the animation clock to update text and dots,
  // and only touches the DOM when something actually changes.
  const cycleLen = BREATH_IN + BREATH_OUT;
  const total = cycles * cycleLen;
  const orb = $("orb");
  const label = $("breathLabel");
  const dots = $("dots");
  let anim = null;
  let haloAnim = null;
  const stopAnims = () => {
    if (anim) anim.cancel();
    if (haloAnim) haloAnim.cancel();
  };
  let raf = 0;
  let finished = false;
  let lastWord = "";
  let lastDone = -1;
  let lastLeft = -1;

  function frame() {
    const el = Number(anim.currentTime) / 1000;
    const t = el % cycleLen;
    const word = t < BREATH_IN ? "Breathe in" : "Breathe out slowly";
    if (word !== lastWord) {
      lastWord = word;
      label.textContent = word;
    }
    const done = Math.min(cycles, Math.floor(el / cycleLen));
    if (done !== lastDone) {
      lastDone = done;
      [...dots.children].forEach((d, i) => d.classList.toggle("done", i < done));
    }
    if (!finished) {
      if (el >= total) {
        finished = true;
        go.disabled = false;
        status.textContent = "Whenever you feel ready";
      } else {
        const left = Math.ceil(total - el);
        if (left !== lastLeft) {
          lastLeft = left;
          status.textContent = `${left} s`;
        }
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function showStep2() {
    $("step1").hidden = true;
    $("step2").hidden = false;
    $("dot1").classList.remove("on");
    $("dot2").classList.add("on");
    $("recap").textContent = `${reason.value.trim()} · ${Number(minutes.value)} min`;
    dots.replaceChildren(...Array.from({ length: cycles }, () => document.createElement("span")));
    finished = false;
    lastWord = "";
    lastDone = -1;
    lastLeft = -1;
    go.disabled = true;
    stopAnims();
    const timing = { duration: cycleLen * 1000, iterations: Infinity };
    const off = BREATH_IN / cycleLen;
    anim = orb.animate(
      [
        { transform: "scale(.5)", easing: "ease-in-out" },
        { transform: "scale(1)", offset: off, easing: "ease-in-out" },
        { transform: "scale(.5)" },
      ],
      timing
    );
    haloAnim = $("halo").animate(
      [
        { transform: "scale(.5)", opacity: 0.35, easing: "ease-in-out" },
        { transform: "scale(1)", opacity: 1, offset: off, easing: "ease-in-out" },
        { transform: "scale(.5)", opacity: 0.35 },
      ],
      timing
    );
    raf = requestAnimationFrame(frame);
  }
  function showStep1() {
    cancelAnimationFrame(raf);
    stopAnims();
    $("step2").hidden = true;
    $("step1").hidden = false;
    $("dot2").classList.remove("on");
    $("dot1").classList.add("on");
    reason.focus();
  }

  async function proceed() {
    cancelAnimationFrame(raf);
    next.disabled = true;
    go.disabled = true;
    const res = await browser.runtime.sendMessage({
      type: "allow",
      url: target,
      reason: reason.value,
      minutes: Number(minutes.value),
    });
    if (res && res.ok) location.replace(target);
    else {
      status.textContent = "That did not work. Is the site still on your list?";
      refresh1();
    }
  }

  next.addEventListener("click", () => {
    if (!ready1()) return;
    if (cycles > 0) showStep2();
    else proceed();
  });
  $("back").addEventListener("click", showStep1);
  go.addEventListener("click", proceed);
})();
