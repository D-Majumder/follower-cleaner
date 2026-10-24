(() => {
  if (window.__igCleanerLoaded) return;
  window.__igCleanerLoaded = true;

  // ---------- Settings ----------
  const CFG = {
    removeDelay: [30000, 75000],   // 30-75s between each removal
    scrollDelay: [1800, 3500],     // pause after scrolling the followers list
    pageDelay: [4000, 9000],       // pause between list-page requests while scanning
    batchSize: 8,                  // removals before a longer rest
    batchRest: [240000, 480000],   // 4-8 min rest after each batch
    dailyCap: 0,                   // 0 = no daily cap
    skipVerified: true             // never remove verified accounts
  };

  const APP_ID = "936619743392459";
  let running = false, stopFlag = false, candidates = [];
  let runRemoved = 0, runTarget = 0;

  // ---------- Helpers ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = ([a, b]) => Math.floor(a + Math.random() * (b - a));
  const getCookie = n => (document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")) || [])[1];
  const today = () => new Date().toISOString().slice(0, 10);
  const norm = t => (t || "").trim().toLowerCase();

  async function waitFor(fn, timeout = 6000, step = 250) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  }

  const headers = () => ({
    "X-CSRFToken": getCookie("csrftoken"),
    "X-IG-App-ID": APP_ID,
    "X-Requested-With": "XMLHttpRequest"
  });

  async function getDailyCount() {
    const { daily } = await chrome.storage.local.get("daily");
    return daily && daily.date === today() ? daily.count : 0;
  }
  async function bumpDaily() {
    const c = (await getDailyCount()) + 1;
    await chrome.storage.local.set({ daily: { date: today(), count: c } });
    return c;
  }

  // ---------- UI (isolated in a shadow root so Instagram's CSS can't touch it) ----------
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .card{--bg:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--soft:#f3f4f6;--accent:#4f46e5;--accent-fg:#fff;
      --danger:#dc2626;--ok:#16a34a;--warn:#d97706;--logbg:#f9fafb;
      width:344px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:16px;
      box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden;font-size:13px;line-height:1.4}
    @media (prefers-color-scheme:dark){
      .card{--bg:#18181b;--fg:#f4f4f5;--muted:#a1a1aa;--line:#2f2f35;--soft:#27272a;--logbg:#101012;--accent:#818cf8;--accent-fg:#111}
    }
    .head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:move;user-select:none;
      background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff}
    .name{font-size:14px;font-weight:700}
    .sub{font-size:11px;opacity:.85}
    .head-right{display:flex;align-items:center;gap:8px}
    .pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.22);color:#fff}
    .pill.busy{background:#2563eb}.pill.ok{background:#16a34a}.pill.warn{background:#d97706}.pill.error{background:#dc2626}
    .icon{width:24px;height:24px;border:none;border-radius:6px;background:rgba(255,255,255,.2);color:#fff;font-size:16px;line-height:1;cursor:pointer}
    .icon:hover{background:rgba(255,255,255,.35)}
    .body{padding:14px;display:flex;flex-direction:column;gap:12px}
    .body.hidden{display:none}
    .row{display:flex;align-items:center;gap:10px}
    .num{flex:none;width:22px;height:22px;border-radius:50%;background:var(--soft);color:var(--muted);font-size:11px;font-weight:700;
      display:flex;align-items:center;justify-content:center}
    .grow{flex:1;min-width:0}
    .t1{font-weight:600}
    .hint{color:var(--muted);font-size:11.5px}
    .btn{border:none;border-radius:10px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:filter .15s,opacity .15s}
    .btn:hover:not(:disabled){filter:brightness(1.08)}
    .btn:disabled{opacity:.45;cursor:not-allowed}
    .primary{background:var(--accent);color:var(--accent-fg)}
    .secondary{background:var(--soft);color:var(--fg)}
    .danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}
    .ghost{background:transparent;color:var(--muted);padding:4px 8px;font-size:11.5px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .tile{background:var(--soft);border-radius:10px;padding:8px 6px;text-align:center}
    .tile b{display:block;font-size:18px}
    .tile span{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
    .bar{height:6px;background:var(--soft);border-radius:999px;overflow:hidden}
    .fill{height:100%;width:0;background:linear-gradient(90deg,#6366f1,#a855f7);transition:width .3s}
    .opts{display:flex;align-items:center;justify-content:space-between;gap:10px}
    input[type=number]{width:64px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font-size:13px}
    textarea{width:100%;height:56px;margin-top:6px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font-size:12px;resize:vertical}
    details summary{cursor:pointer;color:var(--muted);font-size:12px}
    .fast{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:10px}
    .fast.on{border-color:var(--danger);background:rgba(220,38,38,.07)}
    .fast .warnline{font-size:11px;color:var(--danger)}
    .switch input{display:none}
    .track{display:block;width:36px;height:20px;border-radius:999px;background:#9ca3af;position:relative;cursor:pointer;transition:background .2s}
    .track::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s}
    .switch input:checked + .track{background:var(--danger)}
    .switch input:checked + .track::after{left:18px}
    .actions{display:flex;gap:8px}
    .actions .primary{flex:1}
    .loghead{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;font-weight:600}
    .log{height:112px;overflow:auto;background:var(--logbg);border:1px solid var(--line);border-radius:10px;padding:8px;
      font:11.5px/1.55 ui-monospace,Menlo,Consolas,monospace}
    .l .t{color:var(--muted);margin-right:6px}
    .l.ok{color:var(--ok)}.l.err{color:var(--danger)}
  </style>
  <div class="card">
    <div class="head" id="igc-drag">
      <div><div class="name">Follower Cleaner</div><div class="sub">Remove followers you don't follow back</div></div>
      <div class="head-right"><span class="pill" id="igc-pill">Idle</span><button class="icon" id="igc-min" title="Minimize">&#8211;</button></div>
    </div>
    <div class="body" id="igc-body">
      <div class="row">
        <div class="num">1</div>
        <div class="grow"><div class="t1">Scan your followers</div><div class="hint">Finds who you don't follow back</div></div>
        <button class="btn secondary" id="igc-scan">Scan</button>
      </div>

      <div class="stats">
        <div class="tile"><b id="igc-s-found">0</b><span>To remove</span></div>
        <div class="tile"><b id="igc-s-removed">0</b><span>Removed</span></div>
        <div class="tile"><b id="igc-s-today">0</b><span>Today</span></div>
      </div>
      <div class="bar"><div class="fill" id="igc-fill"></div></div>

      <div class="row">
        <div class="num">2</div>
        <div class="grow"><div class="t1">Open Followers list</div><div class="hint">Profile &rarr; Followers, keep it open</div></div>
        <button class="btn ghost" id="igc-check" title="Checks what the script can see. Clicks nothing.">Check</button>
      </div>

      <details>
        <summary>Keep list (optional)</summary>
        <textarea id="igc-keep" placeholder="Usernames to keep, one per line"></textarea>
      </details>

      <div class="opts">
        <div><div class="t1">Limit this run</div><div class="hint">0 = remove everyone</div></div>
        <input id="igc-limit" type="number" min="0" value="3">
      </div>

      <div class="fast" id="igc-fastbox">
        <div><div class="t1">Fast mode</div><div class="warnline">Unsafe: no breaks, may get you restricted</div></div>
        <label class="switch"><input id="igc-fast" type="checkbox"><span class="track"></span></label>
      </div>

      <div class="row">
        <div class="num">3</div>
        <div class="actions grow">
          <button class="btn primary" id="igc-start" disabled>Start removing</button>
          <button class="btn danger" id="igc-stop" disabled>Stop</button>
        </div>
      </div>

      <div>
        <div class="loghead"><span>Activity</span><button class="btn ghost" id="igc-clear">Clear</button></div>
        <div class="log" id="igc-log"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(host);
  const $ = sel => root.querySelector(sel);

  const logEl = $("#igc-log");
  function log(m) {
    const kind = /^Removed/.test(m) ? "ok" : /Stopped|error|Couldn't|Can't|did not|isn't|was closed|Not logged|Instagram showed/i.test(m) ? "err" : "";
    const d = document.createElement("div");
    d.className = "l " + kind;
    d.innerHTML = `<span class="t">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>`;
    d.appendChild(document.createTextNode(m));
    logEl.appendChild(d);
    logEl.scrollTop = logEl.scrollHeight;
  }
  $("#igc-clear").onclick = () => { logEl.innerHTML = ""; };

  function setPill(text, kind) { const p = $("#igc-pill"); p.textContent = text; p.className = "pill " + (kind || ""); }
  async function refreshStats() {
    $("#igc-s-found").textContent = candidates.length;
    $("#igc-s-removed").textContent = runRemoved;
    $("#igc-fill").style.width = runTarget ? Math.min(100, Math.round(runRemoved / runTarget * 100)) + "%" : "0%";
    $("#igc-s-today").textContent = await getDailyCount();
  }
  function setBusy(b) {
    $("#igc-scan").disabled = b;
    $("#igc-start").disabled = b || candidates.length === 0;
    $("#igc-stop").disabled = !b;
  }
  refreshStats();

  // minimize
  $("#igc-min").onclick = () => {
    const body = $("#igc-body"); const hidden = body.classList.toggle("hidden");
    $("#igc-min").textContent = hidden ? "+" : "\u2013";
  };

  // drag by header
  (() => {
    let sx, sy, ox, oy, dragging = false;
    $("#igc-drag").addEventListener("mousedown", e => {
      if (e.target.closest("button")) return;
      dragging = true; const r = host.getBoundingClientRect();
      ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; e.preventDefault();
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      host.style.left = Math.max(0, ox + e.clientX - sx) + "px";
      host.style.top = Math.max(0, oy + e.clientY - sy) + "px";
      host.style.right = "auto"; host.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => { dragging = false; });
  })();

  // fast mode toggle + warning
  const isFast = () => $("#igc-fast").checked;
  $("#igc-fast").onchange = e => {
    if (!e.target.checked) {
      $("#igc-fastbox").classList.remove("on");
      return log("Fast mode off. Normal delays and rests restored.");
    }
    const ok = window.confirm(
      "WARNING: Fast mode is UNSAFE.\n\n" +
      "It removes followers with no rests and almost no delays. Instagram may block your actions " +
      "(\"Try again later\"), temporarily restrict your account, or in worse cases suspend it.\n\n" +
      "Use at your own risk. Continue?");
    if (!ok) e.target.checked = false;
    else { $("#igc-fastbox").classList.add("on"); log("FAST MODE on: no rests, minimal delays. This is unsafe."); }
  };

  // ---------- Scanning (read-only API calls) ----------
  async function readJson(res) {
    const text = await res.text();
    try { return JSON.parse(text); }
    catch {
      throw new Error("Instagram returned a web page instead of data (logged out, checkpoint, or rate limit). Open instagram.com in a normal tab and check.");
    }
  }

  async function fetchList(uid, kind) {
    const out = []; let maxId = "";
    while (!stopFlag) {
      const url = `/api/v1/friendships/${uid}/${kind}/?count=100${maxId ? "&max_id=" + maxId : ""}`;
      const res = await fetch(url, { headers: headers(), credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${kind}`);
      const data = await readJson(res);
      out.push(...(data.users || []));
      log(`${kind}: ${out.length} loaded`);
      if (!data.next_max_id) break;
      maxId = data.next_max_id;
      await sleep(rand(CFG.pageDelay));
    }
    return out;
  }

  // ---------- Followers dialog helpers (what you see on screen) ----------
  const RESERVED = new Set(["explore", "reels", "reel", "direct", "accounts", "stories", "p", "tv", "about", "legal", "web", "api"]);
  const buttonsIn = root => [...root.querySelectorAll('button, div[role="button"]')];
  const findBtn = (root, text) => buttonsIn(root).find(b => norm(b.textContent) === text) || null;
  const allRemoveButtons = () => buttonsIn(document).filter(b => norm(b.textContent) === "remove");

  function userFromAnchor(a) {
    try {
      const m = new URL(a.href, location.origin).pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
      if (!m) return null;
      const u = m[1].toLowerCase();
      return RESERVED.has(u) ? null : u;
    } catch { return null; }
  }

  function getDialog() {
    return [...document.querySelectorAll('div[role="dialog"]')]
      .find(d => d.querySelector("a[href]") && findBtn(d, "remove")) || null;
  }

  function getScroller(dialog) {
    const c = [dialog, ...dialog.querySelectorAll("div")].filter(el =>
      el.scrollHeight > el.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(el).overflowY));
    c.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return c[0] || null;
  }

  // Start from each Remove button, climb until the row contains exactly one username
  function visibleRows(dialog) {
    const rows = [];
    for (const btn of buttonsIn(dialog)) {
      if (norm(btn.textContent) !== "remove") continue;
      let el = btn;
      for (let i = 0; i < 12; i++) {
        el = el.parentElement;
        if (!el || el === dialog) break;
        const names = new Set([...el.querySelectorAll("a[href]")].map(userFromAnchor).filter(Boolean));
        if (names.size === 1) { rows.push({ u: [...names][0], el, btn }); break; }
        if (names.size > 1) break;
      }
    }
    return rows;
  }

  const userVisible = (dialog, u) => visibleRows(dialog).some(r => r.u === u);

  const blocked = () => /try again later|action blocked|we restrict certain activity/i.test(document.body.innerText);

  async function removeRow(dialog, username, row) {
    row.el.scrollIntoView({ block: "center" });
    await sleep(isFast() ? rand([150, 350]) : rand([900, 2000]));
    const before = new Set(allRemoveButtons());
    row.btn.click();

    // confirmation popup: the "Remove follower?" card with its own red Remove button
    const confirm = await waitFor(() => {
      const fresh = allRemoveButtons().filter(btn => !before.has(btn)).reverse();
      for (const btn of fresh) {
        let el = btn;
        for (let i = 0; i < 8; i++) {
          el = el.parentElement;
          if (!el) break;
          if (norm(el.textContent).includes("remove follower")) return { btn, area: el };
        }
      }
      return null;
    }, 7000);
    if (!confirm) throw new Error("The 'Remove follower?' popup did not appear");
    let area = confirm.area;
    if (!norm(area.textContent).includes(username) && area.parentElement) area = area.parentElement;
    if (!norm(area.textContent).includes(username)) throw new Error(`Popup did not mention @${username}, stopping to be safe`);

    await sleep(isFast() ? rand([150, 350]) : rand([800, 1800]));
    confirm.btn.click();

    const gone = await waitFor(() => {
      const d = getDialog();
      return d ? !userVisible(d, username) : true;
    }, 10000);
    if (blocked()) throw new Error("Instagram showed a limit/block message");
    if (!gone) throw new Error(`@${username} is still in the list after confirming`);
  }

  // ---------- Actions ----------
  $("#igc-scan").onclick = async () => {
    if (running) return;
    const uid = getCookie("ds_user_id");
    if (!uid) { setPill("Error", "error"); return log("Not logged in (no ds_user_id cookie)."); }
    running = true; stopFlag = false; setBusy(true);
    setPill("Scanning", "busy");
    let pill = ["Ready", "ok"];
    try {
      log("Scanning followers...");
      const followers = await fetchList(uid, "followers");
      log("Scanning following...");
      const following = await fetchList(uid, "following");
      const followingIds = new Set(following.map(u => u.pk));
      if (stopFlag) throw new Error("Stopped");
      const keep = new Set($("#igc-keep").value.split("\n").map(s => s.trim().toLowerCase()).filter(Boolean));
      candidates = followers.filter(u =>
        !followingIds.has(u.pk) &&
        !keep.has(u.username.toLowerCase()) &&
        !(CFG.skipVerified && u.is_verified));
      runRemoved = 0; runTarget = 0;
      log(`Done. ${candidates.length} followers you don't follow back (after skips).`);
      log("Next: open your profile, click Followers so the list is open, then press Start.");
    } catch (e) { log("Scan error: " + e.message); pill = e.message === "Stopped" ? ["Stopped", "warn"] : ["Error", "error"]; }
    running = false; setBusy(false); setPill(...pill); refreshStats();
  };

  $("#igc-start").onclick = async () => {
    if (running || !candidates.length) return;
    let dialog = getDialog();
    if (!dialog) return log("Followers list isn't open. Go to your profile, click Followers, then press Start.");

    running = true; stopFlag = false; setBusy(true);
    setPill("Removing", "busy");

    const limit = Math.max(0, parseInt($("#igc-limit").value, 10) || 0);
    const remaining = new Set(candidates.map(u => u.username.toLowerCase()));
    let batch = 0, idle = 0;
    const seen = new Set();
    runRemoved = 0;
    runTarget = limit ? Math.min(limit, remaining.size) : remaining.size;
    refreshStats();
    if (isFast()) log("Fast mode is ON. No rests, minimal delays.");

    let outcome = ["Stopped", "warn"];

    const sc0 = getScroller(dialog);
    if (sc0) sc0.scrollTop = 0;
    await sleep(1500);

    try {
      while (!stopFlag && remaining.size) {
        if (limit && runRemoved >= limit) { log(`Reached this run's limit (${limit}).`); outcome = ["Limit reached", "ok"]; break; }
        if (CFG.dailyCap > 0 && (await getDailyCount()) >= CFG.dailyCap) { log(`Daily cap (${CFG.dailyCap}) reached.`); break; }

        dialog = getDialog();
        if (!dialog) { log("Followers list was closed. Reopen it and press Start."); break; }

        const rows = visibleRows(dialog);
        rows.forEach(r => seen.add(r.u));
        const hit = rows.find(r => remaining.has(r.u));
        const target = hit ? { u: hit.u, row: hit } : null;

        if (!target) {
          const sc = getScroller(dialog);
          if (!sc) { log("Couldn't find the scrollable list."); break; }
          const h = sc.scrollHeight;
          sc.scrollTop += Math.floor(sc.clientHeight * 0.8);
          await sleep(isFast() ? rand([600, 1200]) : rand(CFG.scrollDelay));
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5;
          idle = (atBottom && sc.scrollHeight === h) ? idle + 1 : 0;
          if (idle >= 3) { log("Reached the end of the list."); outcome = ["End of list", "warn"]; break; }
          continue;
        }

        await removeRow(dialog, target.u, target.row);
        remaining.delete(target.u);
        candidates = candidates.filter(c => c.username.toLowerCase() !== target.u);
        runRemoved++; batch++;
        const n = await bumpDaily();
        log(`Removed @${target.u} (today: ${n}, left: ${remaining.size})`);
        refreshStats();

        if (isFast()) {
          await sleep(rand([300, 800]));
        } else if (batch >= CFG.batchSize) {
          batch = 0;
          const rest = rand(CFG.batchRest);
          log(`Resting ${Math.round(rest / 60000)} min...`);
          setPill("Resting", "warn");
          await sleep(rest);
          if (!stopFlag) setPill("Removing", "busy");
        } else {
          await sleep(rand(CFG.removeDelay));
        }
      }
      if (!remaining.size) outcome = ["Done", "ok"];
    } catch (e) {
      log(`Stopped: ${e.message}`);
      outcome = ["Error", "error"];
    }

    log(`Finished. Rows read from list: ${seen.size}. Removed this run: ${runRemoved}. Still to go: ${remaining.size}.`);
    if (seen.size === 0) log("Couldn't read any usernames from the list. Press Check and send me what it shows.");
    running = false; setBusy(false); setPill(...outcome); refreshStats();
  };

  $("#igc-check").onclick = () => {
    const dialog = getDialog();
    if (!dialog) return log("No followers list with Remove buttons found. Open Profile > Followers first.");
    const removeBtns = buttonsIn(dialog).filter(b => norm(b.textContent) === "remove").length;
    const rows = visibleRows(dialog);
    log(`Remove buttons: ${removeBtns}, rows read: ${rows.length}`);
    log("Sample: " + (rows.slice(0, 5).map(r => "@" + r.u).join(", ") || "none"));
    if (candidates.length) {
      const set = new Set(candidates.map(c => c.username.toLowerCase()));
      log(`Visible rows that are on your remove list: ${rows.filter(r => set.has(r.u)).length}`);
    }
    const b = buttonsIn(dialog).find(x => norm(x.textContent) === "remove");
    if (b) {
      let el = b; const path = [];
      for (let i = 0; i < 8 && el && el !== dialog; i++) {
        el = el.parentElement; if (!el) break;
        const as = [...el.querySelectorAll("a[href]")];
        path.push(`${el.tagName.toLowerCase()}(a:${as.length}${as[0] ? " " + as[0].getAttribute("href") : ""})`);
      }
      log("Structure: " + path.join(" > "));
    }
    log(getScroller(dialog) ? "Scroll container found." : "No scroll container found.");
  };

  $("#igc-stop").onclick = () => { stopFlag = true; log("Stopping after current step..."); };
})();
