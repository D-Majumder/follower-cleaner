// Core: label dictionary, smart button finder, row reader, action runner, bot scoring.
// Everything here is platform-agnostic. Platform specifics live in platforms.js.
(() => {
  const FC = (window.FC = window.FC || {});

  // ---------- Button label dictionary (lowercase). Extend freely for more languages. ----------
  const L = {
    remove: ["remove", "eliminar", "quitar", "supprimer", "retirer", "entfernen", "remover", "rimuovi"],
    removeMenu: ["remove this follower", "remove follower", "remove from followers", "remove from my followers",
      "eliminar seguidor", "eliminar a este seguidor", "supprimer ce follower", "supprimer cet abonné",
      "follower entfernen", "remover seguidor", "rimuovi follower"],
    following: ["following", "requested", "siguiendo", "seguindo", "abonné", "abonné(e)", "gefolgt", "segui già"],
    unfriend: ["unfriend", "eliminar de amigos", "eliminar amigo", "retirer de mes amis", "als freund entfernen", "desfazer amizade", "rimuovi dagli amici"],
    unfollow: ["unfollow", "dejar de seguir", "ne plus suivre", "se désabonner", "entfolgen", "deixar de seguir", "smetti di seguire"],
    follow: ["follow", "follow back", "seguir", "seguir también", "seguir também", "suivre", "suivre en retour",
      "folgen", "zurückfolgen", "segui", "segui anche tu"],
    friends: ["friends", "friend", "amigos", "amis", "freunde", "amici"],
    followsYou: ["follows you", "te sigue", "vous suit", "folgt dir", "segue você", "ti segue"],
    more: ["more", "more actions", "more options", "options", "friend options", "friends options", "más opciones", "plus d'options",
      "weitere optionen", "mais opções", "altre opzioni", "…", "...", "⋯"],
    confirm: ["confirm", "ok", "yes", "sí", "oui", "ja", "sim", "conferma"],
    followersHead: ["followers", "seguidores", "abonnés", "follower", "seguaci"],
    followingHead: ["following", "seguidos", "abonnements", "gefolgt", "seguindo", "seguiti"]
  };
  L.all = [...new Set(Object.values(L).flat())];
  FC.LABELS = L;

  // ---------- Speed profiles ----------
  FC.SPEEDS = {
    safe:   { name: "Safe",   hint: "30-75 s between actions, long rests",    act: [30000, 75000], pre: [900, 2000], scroll: [1800, 3500], page: [4000, 9000], batch: 8,  rest: [240000, 480000] },
    normal: { name: "Normal", hint: "8-18 s between actions, short rests",    act: [8000, 18000],  pre: [600, 1400], scroll: [1200, 2400], page: [2000, 4500], batch: 20, rest: [120000, 240000] },
    fast:   { name: "Fast",   hint: "No rests, under a second between actions", act: [300, 800],   pre: [150, 350],  scroll: [600, 1200],  page: [400, 900],   batch: 0,  rest: [0, 0] }
  };

  // ---------- Small utilities ----------
  const norm = t => (t || "").replace(/\s+/g, " ").trim().toLowerCase();
  FC.norm = norm;
  FC.sleep = ms => new Promise(r => setTimeout(r, ms));
  FC.rand = ([a, b]) => Math.floor(a + Math.random() * (b - a + 1));
  FC.waitFor = async (fn, timeout = 6000, step = 250) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = fn();
      if (v) return v;
      await FC.sleep(step);
    }
    return null;
  };

  // ---------- Smart finder: locate controls by what they SAY, not where they are ----------
  const CLICKABLE = 'button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="option"], a[role="button"], input[type="button"], input[type="submit"], [tabindex="0"]';
  FC.CLICKABLE = CLICKABLE;

  const visible = el => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  };
  FC.visible = visible;

  const labelsOf = el => {
    const out = [];
    const a = el.getAttribute("aria-label"); if (a) out.push(norm(a));
    const t = norm(el.innerText || el.textContent); if (t && t.length <= 60) out.push(t);
    const ti = el.getAttribute("title"); if (ti) out.push(norm(ti));
    if (typeof el.value === "string" && el.value) out.push(norm(el.value));
    return out;
  };
  FC.labelsOf = labelsOf;

  const matches = (el, words) => labelsOf(el).some(l => words.some(w => l === w || l.startsWith(w + " ")));
  FC.matches = matches;

  const findAll = (root, words) => [...root.querySelectorAll(CLICKABLE)].filter(el => visible(el) && matches(el, words));

  const findByText = (root, words) => {
    for (const el of root.querySelectorAll("span, div, p")) {
      if (el.children.length > 1) continue;
      const t = norm(el.textContent);
      if (!t || t.length > 40 || !words.includes(t) || !visible(el)) continue;
      return el.closest(CLICKABLE) || el;
    }
    return null;
  };

  // Find inside a root: known selector first (if given), then by label, then by bare text.
  FC.find = (root, words, selector) => {
    if (selector) { const s = [...root.querySelectorAll(selector)].find(visible); if (s) return s; }
    return findAll(root, words)[0] || findByText(root, words);
  };

  // ---------- Blocked / rate-limit detection ----------
  FC.blocked = () => /try again later|action blocked|we restrict certain activity|unable to (follow|unfollow)|temporarily blocked|you('| a)re (doing that )?too (fast|much)/i
    .test(document.body.innerText || "");

  // ---------- Row discovery ----------
  // Climb from a control up to the smallest ancestor that holds exactly one profile link.
  FC.rowOf = (btn, container, userFromAnchor) => {
    let el = btn;
    for (let i = 0; i < 12; i++) {
      el = el.parentElement;
      if (!el || el === container || el === document.body) return null;
      const names = new Set([...el.querySelectorAll("a[href]")].map(userFromAnchor).filter(Boolean));
      if (names.size === 1) return { el, u: [...names][0] };
      if (names.size > 1) return null;
    }
    return null;
  };

  const inChrome = el => !!el.closest('header, nav, [role="banner"], [role="navigation"]');
  let skipSel = "";
  const skipped = el => !!skipSel && !!el.closest(skipSel);

  FC.readRows = (platform, container, list) => {
    skipSel = platform.skip || "";
    const out = new Map();
    const add = (el, u) => { if (u && !out.has(u)) out.set(u, { el, u }); };
    if (platform.rowSelector) {
      container.querySelectorAll(platform.rowSelector).forEach(el => {
        if (skipped(el)) return;
        add(el, [...el.querySelectorAll("a[href]")].map(platform.userFromAnchor).find(Boolean));
      });
    }
    // 1) rows found through their action buttons (by label, or by "opens a menu")
    if (!out.size) {
      const words = platform.lists[list].rowWords;
      for (const btn of container.querySelectorAll(CLICKABLE)) {
        if (!visible(btn) || inChrome(btn) || skipped(btn)) continue;
        if (!matches(btn, words) && !(platform.menuRows && btn.getAttribute("aria-haspopup") === "menu")) continue;
        const r = FC.rowOf(btn, container, platform.userFromAnchor);
        if (r) add(r.el, r.u);
      }
    }
    // 2) also pick up rows through their profile links, in case their buttons use unexpected wording
    {
      for (const a of container.querySelectorAll("a[href]")) {
        const u = platform.userFromAnchor(a);
        if (!u || out.has(u) || inChrome(a) || skipped(a)) continue;
        let el = a;
        for (let i = 0; i < 10; i++) {
          el = el.parentElement;
          if (!el || el === container || el === document.body) break;
          const names = new Set([...el.querySelectorAll("a[href]")].map(platform.userFromAnchor).filter(Boolean));
          if (names.size > 1) break;
          if ([...el.querySelectorAll(CLICKABLE)].some(b => visible(b) && !b.matches("a[href]"))) { add(el, u); break; }
        }
      }
    }
    // keep on-screen (top to bottom) order
    return [...out.values()].sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
  };

  FC.findContainer = (platform, list) => {
    const sel = '[role="dialog"], [aria-modal="true"]' + (platform.containerSelector ? ", " + platform.containerSelector : "");
    const okFor = c => c.querySelector("a[href]") && FC.readRows(platform, c, list).length > 0 &&
      (!platform.headingOk || platform.headingOk(c, list));
    for (const c of [...document.querySelectorAll(sel)].filter(visible).reverse()) if (okFor(c)) return c;
    const main = document.querySelector('main, [role="main"]') || document.body;
    if (platform.pageList && platform.pageList(list) && okFor(main)) return main;
    if (platform.anyContainer) { if (okFor(main)) return main; if (okFor(document.body)) return document.body; }
    return null;
  };

  FC.makeScroller = container => {
    const isPage = container === document.body || container.tagName === "MAIN" || container.getAttribute("role") === "main";
    let el = null;
    if (!isPage) {
      const c = [container, ...container.querySelectorAll("div, ul, section")].filter(e =>
        e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      c.sort((a, b) => b.scrollHeight - a.scrollHeight);
      el = c[0] || null;
    }
    const se = el || document.scrollingElement || document.documentElement; // no inner scroller: scroll the page
    const viewH = () => (el ? el.clientHeight : window.innerHeight);
    return {
      reset: () => { se.scrollTop = 0; },
      by: () => { se.scrollTop += Math.floor(viewH() * 0.8); },
      metrics: () => ({ h: se.scrollHeight, atBottom: se.scrollTop + viewH() >= se.scrollHeight - 5 })
    };
  };

  // ---------- Row details (what the row itself tells us) ----------
  FC.rowInfo = (row) => {
    const el = row.el;
    const text = el.innerText || "";
    const t = norm(text);
    const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
    const btns = [...el.querySelectorAll(CLICKABLE)].filter(visible);
    let relation = "none";
    if (btns.some(b => matches(b, L.friends))) relation = "friends";
    else if (btns.some(b => matches(b, L.following))) relation = "following";
    else if (btns.some(b => matches(b, L.follow)) || lines.some(l => L.follow.includes(norm(l)) || /[·•]\s*(follow|follow back)\s*$/i.test(l))) relation = "follow";
    const rest = lines.filter(l => norm(l) !== row.u && l !== "·" && !L.all.includes(norm(l)) && !norm(l).startsWith("@"));
    const img = el.querySelector("img");
    const mm = t.match(/(\d[\d,]*)\s+mutual/);
    return {
      u: row.u,
      name: rest[0] || "",
      bio: rest.slice(1).join(" "),
      relation,
      followsYou: L.followsYou.some(w => t.includes(w)),
      mutual: mm ? parseInt(mm[1].replace(/,/g, ""), 10) : 0,
      verified: !!el.querySelector('[aria-label*="erified" i], svg[title*="erified" i], [data-testid="icon-verified"]'),
      defaultAvatar: !!img && /default_profile|default-avatar|anonymous|empty_avatar|default_pfp/i.test(img.src || "")
    };
  };

  // ---------- Action runner ----------
  // steps: [{from:"row"|"layer", words:[...], selector?:"css", optional?:bool, needName?:bool}]
  // "row"   = a control inside the person's row.
  // "layer" = a control that APPEARS after the previous click (menu item, confirm button).
  // steps may also be a list of alternative step lists: the first whose row control exists is used.
  FC.act = async (row, steps, { username, alias = "", prompt, pre, step, verifyByClose = false }) => {
    if (Array.isArray(steps[0])) {
      steps = steps.find(v => v[0].from !== "row" || FC.find(row.el, v[0].words, v[0].selector)) || steps[0];
    }
    const aliasN = norm(alias);
    row.el.scrollIntoView({ block: "center" });
    await FC.sleep(pre());
    let snap = null, first = null, last = null, firstLabels = "";
    for (const st of steps) {
      let target;
      if (st.from === "row") {
        target = FC.find(row.el, st.words, st.selector);
      } else {
        target = await FC.waitFor(() => {
          const pool = [...document.querySelectorAll(CLICKABLE + (st.selector ? ", " + st.selector : ""))];
          const hits = pool.filter(e => !snap.has(e) && visible(e) && (matches(e, st.words) || (st.selector && e.matches(st.selector))));
          return hits[hits.length - 1] || null;
        }, st.optional ? 2500 : 7000);
      }
      if (!target) {
        if (st.optional) continue;
        throw new Error(`Couldn't find a "${st.words[0]}" button (the site may have changed its wording)`);
      }
      if (st.from === "layer") {
        const box = target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]')
          || target.parentElement?.parentElement?.parentElement || document.body;
        const txt = norm(box.textContent);
        const looksRight = txt.includes(username) || (aliasN && txt.includes(aliasN)) || (prompt && prompt.test(txt));
        if (!looksRight) throw new Error(`Popup didn't look right for @${username}, stopping to be safe`);
        if (st.needName && aliasN && !txt.includes(aliasN)) throw new Error(`Popup didn't mention "${alias}", stopping to be safe`);
      }
      snap = new Set(document.querySelectorAll(CLICKABLE));
      if (!first) { first = target; firstLabels = labelsOf(target).join("|"); }
      last = target;
      target.click();
      await FC.sleep(step());
    }
    if (!first) throw new Error("No action was performed");
    const verified = !!(await FC.waitFor(() =>
      !row.el.isConnected || !first.isConnected || !visible(first) || labelsOf(first).join("|") !== firstLabels ||
      (verifyByClose && (!last.isConnected || !visible(last))), 9000));
    if (FC.blocked()) throw new Error("The site showed a limit/block message");
    return { verified };
  };

  // ---------- Bot likelihood (heuristic, always review before acting) ----------
  FC.BOT_LEVELS = { careful: 5, balanced: 4, aggressive: 3 };
  const SPAM = /(crypto|forex|bitcoin|\bbtc\b|usdt|\bnft\b|trading signals?|binary options?|make money|earn \$|dm (me )?(for|to)|promo(tion)?|buy followers|get followers|follow ?4 ?follow|\bf4f\b|\bl4l\b|likes? ?4 ?likes?|giveaway|onlyfans|18\+|nudes?|sexy|hot girls?|cashapp|loan offer|whatsapp me|t\.me\/|wa\.me\/)/i;
  const LINK = /https?:\/\/|www\.|\.(xyz|top|click|link|ru|cc)\b|bit\.ly/i;

  FC.botScore = p => {
    let s = 0; const why = [];
    const u = p.u || p.username || "";
    const text = `${p.name || ""} ${p.bio || ""} ${u}`;
    const digits = (u.match(/\d/g) || []).length;
    if (digits >= 6) { s += 2; why.push("lots of digits in username"); }
    else if (/\d{4,}$/.test(u)) { s += 1; why.push("number string at end of username"); }
    if (p.defaultAvatar) { s += 2; why.push("default profile photo"); }
    if (!p.name) { s += 1; why.push("no display name"); }
    if (SPAM.test(text)) { s += 3; why.push("spam keywords"); }
    if (LINK.test(text)) { s += 2; why.push("link in profile"); }
    if (/(.)\1{3,}/.test(u)) { s += 1; why.push("repeated characters"); }
    if (u.length >= 18) { s += 1; why.push("very long username"); }
    const letters = u.replace(/[^a-z]/gi, "");
    if (letters.length >= 9 && (letters.match(/[aeiou]/gi) || []).length / letters.length < 0.2) { s += 1; why.push("random-looking username"); }
    if (p.verified) { s -= 5; why.push("verified"); }
    return { score: s, reasons: why };
  };
})();
