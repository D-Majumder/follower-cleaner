// UI: floating panel, custom modals, review list. Lives in shadow roots so site CSS can't affect it.
(() => {
  const FC = window.FC;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const CSS = `
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .theme{--bg:#fff;--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--soft:#f3f4f6;--accent:#4f46e5;--accent-fg:#fff;
    --danger:#dc2626;--ok:#16a34a;--warn:#d97706;--logbg:#f9fafb;color:var(--fg);font-size:13px;line-height:1.4}
  @media (prefers-color-scheme:dark){.theme{--bg:#18181b;--fg:#f4f4f5;--muted:#a1a1aa;--line:#2f2f35;--soft:#27272a;--logbg:#101012;--accent:#818cf8;--accent-fg:#111}}
  .card{width:360px;background:var(--bg);border:1px solid var(--line);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);overflow:hidden}
  .head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:move;user-select:none;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff}
  .name{font-size:14px;font-weight:700}.sub{font-size:11px;opacity:.88}
  .hr{display:flex;align-items:center;gap:8px}
  .pill{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.22);color:#fff}
  .pill.busy{background:#2563eb}.pill.ok{background:#16a34a}.pill.warn{background:#d97706}.pill.error{background:#dc2626}
  .icon{width:24px;height:24px;border:none;border-radius:6px;background:rgba(255,255,255,.2);color:#fff;font-size:16px;line-height:1;cursor:pointer}
  .body{padding:14px;display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 110px);overflow:auto;background:var(--bg)}
  .body.hidden{display:none}
  .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.4px;font-weight:700;color:var(--muted);margin-bottom:5px}
  select,input[type=number],textarea,input[type=text]{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font-size:13px}
  textarea{height:54px;resize:vertical;font-size:12px}
  .hint{color:var(--muted);font-size:11.5px;margin-top:4px}
  .seg{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:var(--soft);border-radius:10px;padding:3px;gap:3px}
  .seg button{border:none;background:transparent;color:var(--muted);padding:6px 4px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer}
  .seg button.on{background:var(--bg);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.15)}
  .seg button.on.fast{color:var(--danger)}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  details summary{cursor:pointer;color:var(--muted);font-size:12px;font-weight:600}
  details>div{margin-top:8px;display:flex;flex-direction:column;gap:10px}
  .chk{display:flex;align-items:center;gap:8px;font-size:12.5px}
  .btn{border:none;border-radius:10px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;transition:filter .15s,opacity .15s}
  .btn:hover:not(:disabled){filter:brightness(1.08)}.btn:disabled{opacity:.45;cursor:not-allowed}
  .primary{background:var(--accent);color:var(--accent-fg)}.secondary{background:var(--soft);color:var(--fg)}
  .danger{background:transparent;color:var(--danger);border:1px solid var(--danger)}
  .dangerfill{background:var(--danger);color:#fff}
  .ghost{background:transparent;color:var(--muted);padding:4px 8px;font-size:11.5px}
  .row{display:flex;gap:8px;align-items:center}.grow{flex:1}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .tile{background:var(--soft);border-radius:10px;padding:8px 6px;text-align:center}
  .tile b{display:block;font-size:18px}.tile span{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
  .bar{height:6px;background:var(--soft);border-radius:999px;overflow:hidden}
  .fill{height:100%;width:0;background:linear-gradient(90deg,#6366f1,#a855f7);transition:width .3s}
  .step{display:flex;gap:10px;align-items:flex-start}
  .num{flex:none;width:22px;height:22px;border-radius:50%;background:var(--soft);color:var(--muted);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
  .t1{font-weight:600}
  .loghead{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;font-weight:700}
  .log{height:112px;overflow:auto;background:var(--logbg);border:1px solid var(--line);border-radius:10px;padding:8px;font:11.5px/1.55 ui-monospace,Menlo,Consolas,monospace}
  .foot{text-align:center;font-size:11.5px;color:var(--muted);padding-top:2px}
  .foot a{color:var(--accent);text-decoration:none;font-weight:600}.foot a:hover{text-decoration:underline}
  .l .t{color:var(--muted);margin-right:6px}.l.ok{color:var(--ok)}.l.err{color:var(--danger)}
  /* modal */
  .ov{position:fixed;inset:0;background:rgba(0,0,0,.58);display:flex;align-items:center;justify-content:center;padding:16px;z-index:2147483647}
  .mdl{width:min(460px,100%);max-height:88vh;display:flex;flex-direction:column;background:var(--bg);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden}
  .mdl.wide{width:min(560px,100%)}
  .mh{display:flex;gap:12px;align-items:flex-start;padding:20px 22px 6px}
  .mi{flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:#fff;background:var(--accent)}
  .mi.danger{background:var(--danger)}.mi.warn{background:var(--warn)}
  .mt{font-size:17px;font-weight:700;margin-top:6px}
  .mb{padding:6px 22px 16px;overflow:auto;color:var(--muted);font-size:13px}
  .mb ul{margin:8px 0;padding-left:18px}.mb li{margin:3px 0}.mb b{color:var(--fg)}
  .mb .box{margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--soft);color:var(--fg)}
  .mf{display:flex;justify-content:flex-end;gap:8px;padding:12px 22px;border-top:1px solid var(--line);background:var(--soft)}
  .rvtools{display:flex;gap:8px;align-items:center;margin:8px 0}
  .rvlist{max-height:44vh;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--bg)}
  .rv{display:flex;gap:10px;align-items:flex-start;padding:7px 10px;border-bottom:1px solid var(--line);cursor:pointer;color:var(--fg)}
  .rv:last-child{border-bottom:none}.rv .why{color:var(--muted);font-size:11.5px}.rv .nm{color:var(--muted)}
  `;

  const MODE_HELP = {
    removeNonFollowing: "Removes people who follow you but whom you don't follow.",
    unfollowNonFollowers: "Unfollows accounts you follow that don't follow you back.",
    removeBots: "Scores followers for bot-like signs. You review the list before anything happens.",
    unfollowAll: "Unfollows every account in the open list except your keep list. Use with care.",
    unfollowFriends: "Stops seeing their posts but keeps the friendship. Nobody is told.",
    unfriendNoMutual: "Unfriends people whose row shows no mutual friends. Review the list first.",
    unfriendAll: "Unfriends every person in the open list except your keep list. Use with great care."
  };

  function modal({ tone = "info", title, html, ok = "OK", cancel = "Cancel", needCheck = null, wide = false, collect = null }) {
    return new Promise(resolve => {
      const host = document.createElement("div");
      const sr = host.attachShadow({ mode: "open" });
      const glyph = tone === "danger" ? "!" : tone === "warn" ? "!" : "i";
      sr.innerHTML = `<style>${CSS}</style><div class="theme ov"><div class="mdl ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
        <div class="mh"><div class="mi ${tone}">${glyph}</div><div class="mt">${esc(title)}</div></div>
        <div class="mb">${html}${needCheck ? `<label class="box chk"><input type="checkbox" id="need"> ${esc(needCheck)}</label>` : ""}</div>
        <div class="mf">${cancel ? `<button class="btn secondary" id="no">${esc(cancel)}</button>` : ""}
          <button class="btn ${tone === "danger" ? "dangerfill" : "primary"}" id="yes" ${needCheck ? "disabled" : ""}>${esc(ok)}</button></div>
      </div></div>`;
      document.body.appendChild(host);
      const done = v => { document.removeEventListener("keydown", onKey, true); host.remove(); resolve(v); };
      const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); done(null); } };
      document.addEventListener("keydown", onKey, true);
      const yes = sr.getElementById("yes");
      if (needCheck) sr.getElementById("need").onchange = e => { yes.disabled = !e.target.checked; };
      const no = sr.getElementById("no"); if (no) no.onclick = () => done(null);
      yes.onclick = () => done(collect ? collect(sr) : true);
    });
  }

  function review(cands, approved, title) {
    const body = `<div class="rvtools"><input type="text" id="q" placeholder="Filter by username or reason">
        <button class="btn secondary" id="all">All</button><button class="btn secondary" id="none">None</button></div>
      <div class="hint" id="cnt"></div>
      <div class="rvlist" id="lst">${cands.map(c => `<label class="rv" data-s="${esc((c.u + " " + c.name + " " + c.reason).toLowerCase())}">
        <input type="checkbox" data-u="${esc(c.u)}" ${approved.has(c.u) ? "checked" : ""}>
        <div><b>@${esc(c.u)}</b> <span class="nm">${esc(c.name)}</span><div class="why">${esc(c.reason)}</div></div></label>`).join("")}</div>`;
    const p = modal({ tone: "info", title, html: body, ok: "Save selection", wide: true,
      collect: sr => new Set([...sr.querySelectorAll("input[data-u]:checked")].map(i => i.dataset.u)) });
    // wire after mount (modal appends synchronously)
    const host = [...document.body.children].reverse().find(h => h.shadowRoot && h.shadowRoot.getElementById("lst"));
    if (host) {
      const sr = host.shadowRoot;
      const upd = () => { sr.getElementById("cnt").textContent = `${sr.querySelectorAll("input[data-u]:checked").length} of ${cands.length} will be acted on. Untick anyone you want to keep.`; };
      sr.getElementById("lst").addEventListener("change", upd);
      sr.getElementById("all").onclick = () => { sr.querySelectorAll("input[data-u]").forEach(i => { if (i.closest(".rv").style.display !== "none") i.checked = true; }); upd(); };
      sr.getElementById("none").onclick = () => { sr.querySelectorAll("input[data-u]").forEach(i => { if (i.closest(".rv").style.display !== "none") i.checked = false; }); upd(); };
      sr.getElementById("q").oninput = e => {
        const q = e.target.value.trim().toLowerCase();
        sr.querySelectorAll(".rv").forEach(r => { r.style.display = !q || r.dataset.s.includes(q) ? "" : "none"; });
      };
      upd();
    }
    return p;
  }

  async function create(platform) {
    const modes = platform.modes;
    const defaults = { mode: modes[0], speed: "safe", level: "balanced", limit: 3, cap: 0, keep: "", skipVerified: true };
    let S = { ...defaults };
    try { const r = await chrome.storage.local.get("fc_settings"); S = { ...defaults, ...(r.fc_settings || {}) }; } catch {}
    if (!modes.includes(S.mode)) S.mode = modes[0];
    if (S.speed === "fast") S.speed = "safe"; // never auto-enable the unsafe mode on load

    const on = {};
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483646;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style>
    <div class="theme card">
      <div class="head" id="drag">
        <div><div class="name">Follower Cleaner</div><div class="sub">${esc(platform.name)}${platform.generic ? " (generic mode)" : ""}</div></div>
        <div class="hr"><span class="pill" id="pill">Idle</span><button class="icon" id="min" title="Minimize">&#8211;</button></div>
      </div>
      <div class="body" id="body">
        <div>
          <div class="lbl">What do you want to do?</div>
          <select id="mode">${modes.map(m => `<option value="${m}">${esc(FC.MODES[m].title)}</option>`).join("")}</select>
          <div class="hint" id="modehelp"></div>
        </div>
        <div id="levelbox"><div class="lbl">Bot detection</div>
          <div class="seg" id="level"><button data-v="careful">Careful</button><button data-v="balanced">Balanced</button><button data-v="aggressive">Aggressive</button></div>
          <div class="hint">Careful flags fewer accounts. Always check the review list.</div></div>
        <div><div class="lbl">Speed</div>
          <div class="seg" id="speed"><button data-v="safe">Safe</button><button data-v="normal">Normal</button><button data-v="fast" class="fastb">Fast</button></div>
          <div class="hint" id="speedhint"></div></div>
        <details><summary>More options</summary><div>
          <div><div class="lbl">Keep list (never touched)</div><textarea id="keep" placeholder="One username per line (on Facebook, the person's name)"></textarea></div>
          <label class="chk"><input type="checkbox" id="skipv"> Skip verified accounts</label>
          <div class="two"><div><div class="lbl">Limit per run</div><input id="limit" type="number" min="0"><div class="hint">0 = no limit</div></div>
            <div><div class="lbl">Daily cap</div><input id="cap" type="number" min="0"><div class="hint">0 = no cap</div></div></div>
        </div></details>

        <div class="step"><div class="num">1</div><div class="grow"><div class="t1">Scan</div><div class="hint" id="scanhint">Builds the list of accounts to act on.</div></div>
          <button class="btn secondary" id="scan">Scan</button></div>
        <div class="stats">
          <div class="tile"><b id="sFound">0</b><span>Selected</span></div>
          <div class="tile"><b id="sDone">0</b><span>Done</span></div>
          <div class="tile"><b id="sToday">0</b><span>Today</span></div></div>
        <div class="bar"><div class="fill" id="fill"></div></div>
        <div class="row"><button class="btn secondary grow" id="review" disabled>Review list</button><button class="btn ghost" id="export" disabled>Export CSV</button></div>

        <div class="step"><div class="num">2</div><div class="grow"><div class="t1">Open the list</div><div class="hint" id="listhint"></div></div>
          <button class="btn ghost" id="check" title="Reads the page and clicks nothing">Check</button></div>
        <div class="step"><div class="num">3</div><div class="row grow"><button class="btn primary grow" id="start" disabled>Start</button><button class="btn danger" id="stop" disabled>Stop</button></div></div>

        <div><div class="loghead"><span>Activity</span><button class="btn ghost" id="clear">Clear</button></div><div class="log" id="log"></div></div>
        <div class="foot">Made by Dhruba Majumder &middot; <a href="https://github.com/D-Majumder" target="_blank" rel="noopener noreferrer">GitHub &#8599;</a></div>
      </div>
    </div>`;
    document.body.appendChild(host);
    const $ = s => root.querySelector(s);

    // ----- settings <-> controls -----
    let saveT = null;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { chrome.storage.local.set({ fc_settings: S }); } catch {} }, 300); };
    const paint = () => {
      $("#mode").value = S.mode;
      $("#modehelp").textContent = MODE_HELP[S.mode];
      $("#levelbox").style.display = S.mode === "removeBots" ? "" : "none";
      root.querySelectorAll("#level button").forEach(b => b.classList.toggle("on", b.dataset.v === S.level));
      root.querySelectorAll("#speed button").forEach(b => b.classList.toggle("on", b.dataset.v === S.speed));
      root.querySelectorAll("#speed button").forEach(b => b.classList.toggle("fast", b.dataset.v === "fast"));
      $("#speedhint").textContent = FC.SPEEDS[S.speed].hint;
      $("#keep").value = S.keep; $("#skipv").checked = S.skipVerified; $("#limit").value = S.limit; $("#cap").value = S.cap;
      $("#listhint").textContent = `Open ${platform.lists[FC.MODES[S.mode].list].open} and keep it on screen, then press Start.`;
    };
    paint();

    $("#mode").onchange = e => { S.mode = e.target.value; paint(); save(); on.modeChange && on.modeChange(); };
    root.querySelectorAll("#level button").forEach(b => b.onclick = () => { S.level = b.dataset.v; paint(); save(); });
    root.querySelectorAll("#speed button").forEach(b => b.onclick = async () => {
      const v = b.dataset.v;
      if (v === "fast" && S.speed !== "fast") {
        const ok = await modal({ tone: "danger", title: "Fast mode is unsafe",
          html: `<p>Fast mode removes accounts back to back with no rests and almost no delays.</p>
            <ul><li><b>Action blocks</b>: ${esc(platform.name)} may stop you with a "Try again later" message.</li>
            <li><b>Restrictions</b>: your account can be limited for hours or days.</li>
            <li><b>Suspension</b>: repeated violations can lead to a ban.</li></ul>
            <p>It still stops on its own if the site shows a limit message. Using automation can also go against ${esc(platform.name)}'s terms.</p>`,
          needCheck: "I understand the risks and want to continue", ok: "Enable fast mode", cancel: "Keep it safe" });
        if (!ok) return;
        FC.ui.log && FC.ui.log("Fast mode enabled. No rests, minimal delays. This is unsafe.");
      }
      S.speed = v; paint(); save();
    });
    $("#keep").oninput = e => { S.keep = e.target.value; save(); };
    $("#skipv").onchange = e => { S.skipVerified = e.target.checked; save(); };
    $("#limit").onchange = e => { S.limit = Math.max(0, parseInt(e.target.value, 10) || 0); paint(); save(); };
    $("#cap").onchange = e => { S.cap = Math.max(0, parseInt(e.target.value, 10) || 0); paint(); save(); };

    // ----- log / status / stats -----
    const logEl = $("#log");
    const log = m => {
      const kind = /^(Removed|Unfollowed|Unfriended)/.test(m) ? "ok" : /Stopped|error|Couldn't|Can't|did not|isn't|was closed|Not logged|showed a/i.test(m) ? "err" : "";
      const d = document.createElement("div"); d.className = "l " + kind;
      d.innerHTML = `<span class="t">${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>`;
      d.appendChild(document.createTextNode(m));
      logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight;
    };
    FC.ui = FC.ui || {}; FC.ui.log = log;
    $("#clear").onclick = () => { logEl.innerHTML = ""; };

    // minimize + drag
    $("#min").onclick = () => { const h = $("#body").classList.toggle("hidden"); $("#min").textContent = h ? "+" : "\u2013"; };
    (() => {
      let sx, sy, ox, oy, drag = false;
      $("#drag").addEventListener("mousedown", e => {
        if (e.target.closest("button")) return;
        drag = true; const r = host.getBoundingClientRect(); ox = r.left; oy = r.top; sx = e.clientX; sy = e.clientY; e.preventDefault();
      });
      window.addEventListener("mousemove", e => {
        if (!drag) return;
        host.style.left = Math.max(0, ox + e.clientX - sx) + "px"; host.style.top = Math.max(0, oy + e.clientY - sy) + "px";
        host.style.right = "auto"; host.style.bottom = "auto";
      });
      window.addEventListener("mouseup", () => { drag = false; });
    })();

    $("#scan").onclick = () => on.scan && on.scan();
    $("#start").onclick = () => on.start && on.start();
    $("#stop").onclick = () => on.stop && on.stop();
    $("#check").onclick = () => on.check && on.check();
    $("#review").onclick = () => on.review && on.review();
    $("#export").onclick = () => on.export && on.export();

    return {
      on, log, modal, review,
      settings: () => ({ ...S }),
      setPill: (t, k) => { const p = $("#pill"); p.textContent = t; p.className = "pill " + (k || ""); },
      setStats: ({ selected, done, target, today }) => {
        if (selected != null) $("#sFound").textContent = selected;
        if (done != null) $("#sDone").textContent = done;
        if (today != null) $("#sToday").textContent = today;
        if (target != null && done != null) $("#fill").style.width = target ? Math.min(100, Math.round(done / target * 100)) + "%" : "0%";
      },
      setBusy: (busy, hasCands) => {
        $("#scan").disabled = busy; $("#mode").disabled = busy;
        $("#start").disabled = busy || !hasCands; $("#stop").disabled = !busy;
        $("#review").disabled = busy || !hasCands; $("#export").disabled = busy || !hasCands;
      },
      setScanHint: t => { $("#scanhint").textContent = t; }
    };
  }

  FC.ui = Object.assign(FC.ui || {}, { create });
})();
