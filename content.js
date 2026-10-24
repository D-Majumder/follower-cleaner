(() => {
  if (window.__igCleanerLoaded) return;
  window.__igCleanerLoaded = true;

  // ---------- Settings (conservative on purpose) ----------
  const CFG = {
    unfollowDelay: [30000, 75000],   // 30-75s between each unfollow
    pageDelay: [4000, 9000],         // delay between list-page requests while scanning
    batchSize: 8,                    // unfollows before a longer rest
    batchRest: [240000, 480000],     // 4-8 min rest after each batch
    dailyCap: 60,                    // hard cap per calendar day
    skipVerified: true               // never remove verified accounts
  };

  const APP_ID = "936619743392459";
  let running = false, stopFlag = false, candidates = [];

  // ---------- Helpers ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = ([a, b]) => Math.floor(a + Math.random() * (b - a));
  const getCookie = n => (document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")) || [])[1];
  const today = () => new Date().toISOString().slice(0, 10);

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
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <button id="igc-scan">1. Scan</button>
      <button id="igc-start" disabled>2. Start</button>
      <button id="igc-stop" disabled>Stop</button>
    </div>
    <div id="igc-log" style="height:130px;overflow:auto;background:#f6f6f6;padding:6px;border-radius:6px;font-size:12px;white-space:pre-wrap"></div>`;
  document.body.appendChild(box);
  const $ = id => box.querySelector(id);
  const log = m => { const l = $("#igc-log"); l.textContent += `[${new Date().toLocaleTimeString()}] ${m}\n`; l.scrollTop = l.scrollHeight; };

  // ---------- Instagram requests ----------
  async function fetchList(uid, kind) {
    const out = []; let maxId = "";
    while (!stopFlag) {
      const url = `/api/v1/friendships/${uid}/${kind}/?count=100${maxId ? "&max_id=" + maxId : ""}`;
      const res = await fetch(url, { headers: headers(), credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status} while fetching ${kind}`);
      const data = await res.json();
      out.push(...(data.users || []));
      log(`${kind}: ${out.length} loaded`);
      if (!data.next_max_id) break;
      maxId = data.next_max_id;
      await sleep(rand(CFG.pageDelay));
    }
    return out;
  }

  async function removeFollower(user) {
    const res = await fetch(`/api/v1/friendships/remove_follower/${user.pk}/`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
      body: `user_id=${user.pk}`
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.message || "unexpected response");
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
      $("#igc-start").disabled = candidates.length === 0;
    } catch (e) { log("Scan error: " + e.message); }
    running = false; $("#igc-stop").disabled = true;
  };

  $("#igc-start").onclick = async () => {
    if (running || !candidates.length) return;
    running = true; stopFlag = false;
    $("#igc-start").disabled = true; $("#igc-stop").disabled = false;
    let batch = 0;
    for (const u of [...candidates]) {
      if (stopFlag) break;
      if ((await getDailyCount()) >= CFG.dailyCap) { log(`Daily cap (${CFG.dailyCap}) reached. Come back tomorrow.`); break; }
      try {
        await removeFollower(u);
        const n = await bumpDaily();
        candidates = candidates.filter(c => c.pk !== u.pk);
        log(`Removed follower @${u.username} (today: ${n}/${CFG.dailyCap}, left: ${candidates.length})`);
      } catch (e) {
        log(`Error on @${u.username}: ${e.message}. Stopping to protect your account. Wait several hours before retrying.`);
        break;
      }
      batch++;
      if (batch >= CFG.batchSize) {
        batch = 0;
        const rest = rand(CFG.batchRest);
        log(`Resting ${Math.round(rest / 60000)} min...`);
        await sleep(rest);
      } else {
        await sleep(rand(CFG.unfollowDelay));
      }
    }
    log("Finished / stopped.");
    running = false; $("#igc-stop").disabled = true;
    $("#igc-start").disabled = candidates.length === 0;
  };

  $("#igc-stop").onclick = () => { stopFlag = true; log("Stopping after current step..."); };
})();
