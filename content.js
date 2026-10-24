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

  // ---------- UI ----------
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;bottom:16px;right:16px;width:320px;z-index:999999;background:#fff;color:#111;border:1px solid #ccc;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.2);font:13px system-ui,sans-serif;padding:12px";
  box.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px">Follower Cleaner</div>
    <textarea id="igc-keep" placeholder="Followers to KEEP (usernames, one per line)" style="width:100%;height:50px;box-sizing:border-box;margin-bottom:6px"></textarea>
    <label style="display:block;margin-bottom:6px">Limit this run (0 = all):
      <input id="igc-limit" type="number" min="0" value="3" style="width:60px">
    </label>
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <button id="igc-scan">1. Scan</button>
      <button id="igc-start" disabled>2. Start</button>
      <button id="igc-stop" disabled>Stop</button>
      <button id="igc-check">Check</button>
    </div>
    <div id="igc-log" style="height:130px;overflow:auto;background:#f6f6f6;padding:6px;border-radius:6px;font-size:12px;white-space:pre-wrap"></div>`;
  document.body.appendChild(box);
  const $ = id => box.querySelector(id);
  const log = m => { const l = $("#igc-log"); l.textContent += `[${new Date().toLocaleTimeString()}] ${m}\n`; l.scrollTop = l.scrollHeight; };

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
    await sleep(rand([900, 2000]));
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

    await sleep(rand([800, 1800]));
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
    if (!uid) return log("Not logged in (no ds_user_id cookie).");
    running = true; stopFlag = false;
    $("#igc-stop").disabled = false;
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
      log(`Done. ${candidates.length} followers you don't follow back (after skips).`);
      log("Next: open your profile, click Followers so the list is open, then press Start.");
      $("#igc-start").disabled = candidates.length === 0;
    } catch (e) { log("Scan error: " + e.message); }
    running = false; $("#igc-stop").disabled = true;
  };

  $("#igc-start").onclick = async () => {
    if (running || !candidates.length) return;
    let dialog = getDialog();
    if (!dialog) return log("Followers list isn't open. Go to your profile, click Followers, then press Start.");

    running = true; stopFlag = false;
    $("#igc-start").disabled = true; $("#igc-stop").disabled = false;

    const limit = Math.max(0, parseInt($("#igc-limit").value, 10) || 0);
    const remaining = new Set(candidates.map(u => u.username.toLowerCase()));
    let removedThisRun = 0, batch = 0, idle = 0;
    const seen = new Set();

    const sc0 = getScroller(dialog);
    if (sc0) sc0.scrollTop = 0;
    await sleep(1500);

    try {
      while (!stopFlag && remaining.size) {
        if (limit && removedThisRun >= limit) { log(`Reached this run's limit (${limit}).`); break; }
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
          await sleep(rand(CFG.scrollDelay));
          const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 5;
          idle = (atBottom && sc.scrollHeight === h) ? idle + 1 : 0;
          if (idle >= 3) { log("Reached the end of the list."); break; }
          continue;
        }

        await removeRow(dialog, target.u, target.row);
        remaining.delete(target.u);
        candidates = candidates.filter(c => c.username.toLowerCase() !== target.u);
        removedThisRun++; batch++;
        const n = await bumpDaily();
        log(`Removed @${target.u} (today: ${n}, left: ${remaining.size})`);

        if (batch >= CFG.batchSize) {
          batch = 0;
          const rest = rand(CFG.batchRest);
          log(`Resting ${Math.round(rest / 60000)} min...`);
          await sleep(rest);
        } else {
          await sleep(rand(CFG.removeDelay));
        }
      }
    } catch (e) {
      log(`Stopped: ${e.message}`);
    }

    log(`Finished. Rows read from list: ${seen.size}. Removed this run: ${removedThisRun}. Still to go: ${remaining.size}.`);
    if (seen.size === 0) log("Couldn't read any usernames from the list. Press Check and send me what it shows.");
    running = false; $("#igc-stop").disabled = true;
    $("#igc-start").disabled = candidates.length === 0;
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
