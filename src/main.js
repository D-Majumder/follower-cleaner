// Orchestration: scan -> review -> act. Works the same on every platform adapter.
(async () => {
  const FC = window.FC;
  if (!FC || window.__fcLoaded) return;
  const platform = FC.detectPlatform();
  if (!platform) return;
  window.__fcLoaded = true;

  const { sleep, rand, norm } = FC;
  const ui = await FC.ui.create(platform);
  const log = ui.log;

  const state = { running: false, stop: false, cands: [], approved: new Set(), done: 0, target: 0 };
  const speed = () => FC.SPEEDS[ui.settings().speed];
  const modeOf = () => FC.MODES[ui.settings().mode];
  const keepSet = () => new Set(ui.settings().keep.split("\n").map(s => s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean));

  // ----- daily counter (per platform) -----
  const today = () => new Date().toISOString().slice(0, 10);
  const dailyKey = "fc_daily_" + platform.id;
  async function dailyCount() {
    try { const r = await chrome.storage.local.get(dailyKey); const d = r[dailyKey]; return d && d.date === today() ? d.count : 0; } catch { return 0; }
  }
  async function bumpDaily() {
    const c = (await dailyCount()) + 1;
    try { await chrome.storage.local.set({ [dailyKey]: { date: today(), count: c } }); } catch {}
    return c;
  }
  const refresh = async () => ui.setStats({ selected: state.approved.size, done: state.done, target: state.target, today: await dailyCount() });
  const busy = b => { state.running = b; ui.setBusy(b, state.cands.length > 0); };

  // ----- Instagram: read-only API scan (accurate follower/following sets) -----
  const getCookie = n => (document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)")) || [])[1];
  async function igList(uid, kind) {
    const out = []; let maxId = "";
    while (!state.stop) {
      const res = await fetch(`/api/v1/friendships/${uid}/${kind}/?count=100${maxId ? "&max_id=" + maxId : ""}`, {
        credentials: "include",
        headers: { "X-CSRFToken": getCookie("csrftoken"), "X-IG-App-ID": "936619743392459", "X-Requested-With": "XMLHttpRequest" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} while reading ${kind}`);
      let data;
      try { data = JSON.parse(await res.text()); }
      catch { throw new Error("Instagram returned a web page instead of data (logged out, checkpoint, or rate limit)"); }
      out.push(...(data.users || []));
      log(`${kind}: ${out.length} read`);
      if (!data.next_max_id) break;
      maxId = data.next_max_id;
      await sleep(rand(speed().page));
    }
    return out;
  }
  const igPerson = u => ({ u: u.username.toLowerCase(), pk: u.pk, name: u.full_name || "", bio: "", verified: !!u.is_verified,
    defaultAvatar: !!u.has_anonymous_profile_picture });

  async function scanInstagram(mode) {
    const uid = getCookie("ds_user_id");
    if (!uid) throw new Error("Not logged in");
    const need = { removeNonFollowing: ["followers", "following"], unfollowNonFollowers: ["followers", "following"], removeBots: ["followers"], unfollowAll: ["following"] }[mode];
    const lists = {};
    for (const k of need) lists[k] = (await igList(uid, k)).map(igPerson);
    const pks = a => new Set(a.map(p => p.pk));
    const level = FC.BOT_LEVELS[ui.settings().level];
    const out = [];
    if (mode === "removeNonFollowing") { const f = pks(lists.following); lists.followers.forEach(p => { if (!f.has(p.pk)) out.push({ ...p, reason: "Follows you, you don't follow back" }); }); }
    if (mode === "unfollowNonFollowers") { const f = pks(lists.followers); lists.following.forEach(p => { if (!f.has(p.pk)) out.push({ ...p, reason: "You follow them, they don't follow you" }); }); }
    if (mode === "unfollowAll") lists.following.forEach(p => out.push({ ...p, reason: "In your following list" }));
    if (mode === "removeBots") lists.followers.forEach(p => { const b = FC.botScore(p); if (b.score >= level) out.push({ ...p, score: b.score, reason: `Bot score ${b.score}: ${b.reasons.join(", ")}` }); });
    return out;
  }

  // ----- Other platforms: read the open list on screen while scrolling (read-only) -----
  function decide(mode, p) {
    if (mode === "unfollowAll" || mode === "unfollowFriends" || mode === "unfriendAll") {
      return platform.id === "facebook" ? `${p.mutual} mutual friends` : "In the list";
    }
    if (mode === "unfriendNoMutual") return p.mutual === 0 ? "No mutual friends shown" : null;
    if (mode === "removeNonFollowing") return p.relation === "follow" ? "Follows you, you don't follow back" : null;
    if (mode === "unfollowNonFollowers") {
      if (platform.id === "tiktok") return p.relation === "following" ? "Not a mutual (no Friends status)" : null;
      return !p.followsYou && p.relation !== "friends" ? `No "Follows you" badge` : null;
    }
    if (mode === "removeBots") {
      const b = FC.botScore(p);
      return b.score >= FC.BOT_LEVELS[ui.settings().level] ? `Bot score ${b.score}: ${b.reasons.join(", ")}` : null;
    }
    return null;
  }

  async function scanDom(mode) {
    const m = FC.MODES[mode];
    let container = FC.findContainer(platform, m.list);
    if (!container) throw new Error(`The list isn't open. Open ${platform.lists[m.list].open}, then scan again.`);
    const sc = FC.makeScroller(container);
    if (!sc) throw new Error("Couldn't find the scrollable list");
    sc.reset(); await sleep(1200);
    const seen = new Map(); let idle = 0, lastLogged = 0;
    while (!state.stop) {
      container = FC.findContainer(platform, m.list) || container;
      const before = seen.size;
      FC.readRows(platform, container, m.list).forEach(r => { if (!seen.has(r.u)) seen.set(r.u, FC.rowInfo(r)); });
      if (seen.size - lastLogged >= 50) { lastLogged = seen.size; log(`Reading list: ${seen.size} accounts so far...`); }
      const m0 = sc.metrics(); sc.by(); await sleep(rand(speed().scroll)); const m1 = sc.metrics();
      idle = m1.atBottom && seen.size === before && m1.h === m0.h ? idle + 1 : 0;
      if (idle >= 3) break;
    }
    log(`Read ${seen.size} accounts from the list.`);
    const out = [];
    for (const p of seen.values()) { const why = decide(mode, p); if (why) out.push({ ...p, reason: why }); }
    return out;
  }

  // ----- Actions -----
  ui.on.modeChange = () => {
    state.cands = []; state.approved = new Set(); state.done = 0; state.target = 0;
    ui.setBusy(false, false); ui.setPill("Idle"); refresh();
    log("Mode changed. Scan again to build a new list.");
  };

  ui.on.scan = async () => {
    if (state.running) return;
    const mode = ui.settings().mode;
    busy(true); state.stop = false; ui.setPill("Scanning", "busy");
    let pill = ["Ready", "ok"];
    try {
      log(`Scanning (${FC.MODES[mode].title})...`);
      let found = platform.api ? await scanInstagram(mode) : await scanDom(mode);
      const keep = keepSet(), skipV = ui.settings().skipVerified;
      const before = found.length;
      found = found.filter(p => !keep.has(p.u) && !keep.has(norm(p.name)) && !(skipV && p.verified));
      state.cands = found.sort((a, b) => (b.score || 0) - (a.score || 0));
      state.approved = new Set(found.map(p => p.u));
      state.done = 0; state.target = 0;
      log(`Done. ${found.length} accounts selected${before !== found.length ? ` (${before - found.length} skipped by keep list or verified)` : ""}.`);
      if (mode === "removeBots") log("Bot detection is a guess. Press Review list and untick anyone who looks real.");
      else log(`Next: open ${platform.lists[FC.MODES[mode].list].open}, then press Start.`);
    } catch (e) { log("Scan error: " + e.message); pill = state.stop ? ["Stopped", "warn"] : ["Error", "error"]; }
    busy(false); ui.setPill(...pill); refresh();
  };

  ui.on.review = async () => {
    if (!state.cands.length || state.running) return;
    const res = await ui.review(state.cands, state.approved, `Review ${state.cands.length} accounts`);
    if (res) { state.approved = res; refresh(); log(`Selection saved: ${res.size} accounts will be acted on.`); }
  };

  ui.on.export = () => {
    const q = s => `"${String(s == null ? "" : s).replace(/"/g, '""')}"`;
    const rows = ["username,name,selected,reason", ...state.cands.map(c => [q(c.u), q(c.name), state.approved.has(c.u) ? "yes" : "no", q(c.reason)].join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = `${platform.id}-follower-cleaner-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    log(`Exported ${state.cands.length} rows.`);
  };

  ui.on.stop = () => { state.stop = true; log("Stopping after the current step..."); };

  ui.on.check = () => {
    const m = modeOf();
    const c = FC.findContainer(platform, m.list);
    log(`Platform: ${platform.name}. Mode needs: ${m.list} list.`);
    if (!c) return log(`Couldn't find the ${m.list} list. Open ${platform.lists[m.list].open} first.`);
    const rows = FC.readRows(platform, c, m.list);
    log(`Rows read: ${rows.length}. Sample: ${rows.slice(0, 4).map(r => "@" + r.u).join(", ") || "none"}`);
    if (rows[0]) {
      const info = FC.rowInfo(rows[0]);
      log(`First row: relation=${info.relation}, followsYou=${info.followsYou}`);
      const labels = [...rows[0].el.querySelectorAll(FC.CLICKABLE)].filter(FC.visible).map(b => FC.labelsOf(b)[0]).filter(Boolean);
      log(`Buttons in first row: ${[...new Set(labels)].slice(0, 6).join(" | ") || "none"}`);
    }
    log(FC.makeScroller(c) ? "Scrollable list found." : "No scrollable list found.");
  };

  ui.on.start = async () => {
    if (state.running || !state.approved.size) return;
    const s = ui.settings(), mode = s.mode, m = modeOf(), action = platform.actions[m.action];
    if (!action) return log("This action isn't supported on this site.");
    let container = FC.findContainer(platform, m.list);
    if (!container) return log(`Couldn't find the ${m.list} list. Open ${platform.lists[m.list].open}, then press Start.`);

    const sp = speed();
    const n = s.limit ? Math.min(s.limit, state.approved.size) : state.approved.size;
    const avg = ([a, b]) => (a + b) / 2;
    const secs = n * (avg(sp.act) / 1000) + (sp.batch ? Math.floor(n / sp.batch) * (avg(sp.rest) / 1000) : 0);
    const eta = secs < 90 ? `${Math.round(secs)} seconds` : secs < 5400 ? `about ${Math.round(secs / 60)} minutes` : `about ${(secs / 3600).toFixed(1)} hours`;
    const verb = m.verb;
    const ok = await ui.modal({
      tone: m.warn || s.speed === "fast" ? "danger" : "info", title: `Ready to ${verb} ${n} account${n === 1 ? "" : "s"}?`,
      html: `<ul><li><b>Site:</b> ${platform.name}</li><li><b>Action:</b> ${FC.MODES[mode].title}</li><li><b>Speed:</b> ${sp.name} (${sp.hint})</li>
        <li><b>Estimated time:</b> ${eta}</li></ul>
        <div class="box">Keep this tab open and your computer awake. You can press Stop at any time.${s.limit ? "" : " No per-run limit is set."}</div>`,
      ok: `Yes, ${verb} them`, cancel: "Not yet"
    });
    if (!ok) return;

    busy(true); state.stop = false; ui.setPill("Working", "busy");
    const remaining = new Set(state.approved);
    state.done = 0; state.target = n; refresh();
    const sc0 = FC.makeScroller(container); if (sc0) sc0.reset();
    await sleep(1500);

    let batch = 0, idle = 0, unverified = 0, outcome = ["Stopped", "warn"];
    const seen = new Set();
    try {
      while (!state.stop && remaining.size) {
        if (s.limit && state.done >= s.limit) { log(`Reached this run's limit (${s.limit}).`); outcome = ["Limit reached", "ok"]; break; }
        if (s.cap > 0 && (await dailyCount()) >= s.cap) { log(`Daily cap (${s.cap}) reached. Come back tomorrow.`); outcome = ["Daily cap", "warn"]; break; }
        container = FC.findContainer(platform, m.list);
        if (!container) { log("The list was closed. Reopen it and press Start."); break; }

        const rows = FC.readRows(platform, container, m.list);
        rows.forEach(r => seen.add(r.u));
        const hit = rows.find(r => remaining.has(r.u));
        if (!hit) {
          const sc = FC.makeScroller(container);
          if (!sc) { log("Couldn't find the scrollable list."); break; }
          const m0 = sc.metrics(); sc.by(); await sleep(rand(sp.scroll)); const m1 = sc.metrics();
          idle = m1.atBottom && m1.h === m0.h ? idle + 1 : 0;
          if (idle >= 3) { log("Reached the end of the list."); outcome = ["End of list", "warn"]; break; }
          continue;
        }
        idle = 0;

        const res = await FC.act(hit, action.steps, {
          username: hit.u, alias: FC.rowInfo(hit).name, prompt: action.prompt, verifyByClose: !!action.verifyByClose,
          pre: () => rand(sp.pre), step: () => rand(sp.pre) });
        remaining.delete(hit.u);
        state.cands = state.cands.filter(c => c.u !== hit.u);
        state.approved.delete(hit.u);
        state.done++; batch++;
        const t = await bumpDaily();
        if (res.verified) { unverified = 0; log(`${m.past} @${hit.u} (today: ${t}, left: ${remaining.size})`); }
        else {
          unverified++; log(`Clicked through for @${hit.u} but couldn't confirm it worked (${unverified}/3)`);
          if (unverified >= 3) throw new Error("3 actions in a row couldn't be confirmed. The site may be blocking you");
        }
        refresh();

        if (!remaining.size) break;
        if (sp.batch && batch >= sp.batch) {
          batch = 0; const rest = rand(sp.rest);
          log(`Resting ${Math.round(rest / 60000)} min...`); ui.setPill("Resting", "warn");
          await sleep(rest); if (!state.stop) ui.setPill("Working", "busy");
        } else await sleep(rand(sp.act));
      }
      if (!remaining.size) outcome = ["Done", "ok"];
    } catch (e) { log(`Stopped: ${e.message}`); outcome = ["Error", "error"]; }

    log(`Finished. Done this run: ${state.done}. Left: ${remaining.size}. Rows seen: ${seen.size}.`);
    if (!seen.size) log("Couldn't read any rows from the list. Press Check and send me what it shows.");
    busy(false); ui.setPill(...outcome); refresh();
  };

  log(`Ready on ${platform.name}. Choose what to do, then press Scan.`);
  refresh();
})();
