// Platform adapters. Each one only says WHAT to look for (labels, hints, URL shapes).
// The generic engine in core.js does the finding and clicking.
(() => {
  const FC = window.FC, L = FC.LABELS;

  // What a person can ask the tool to do.
  FC.MODES = {
    removeNonFollowing:   { title: "Remove followers I don't follow back", list: "followers", action: "removeFollower", warn: false },
    unfollowNonFollowers: { title: "Unfollow people who don't follow me back", list: "following", action: "unfollow", warn: false },
    removeBots:           { title: "Remove bot-like followers", list: "followers", action: "removeFollower", warn: false },
    unfollowAll:          { title: "Unfollow everyone in the list", list: "following", action: "unfollow", warn: true }
  };

  const url = a => { try { return new URL(a.href, location.origin); } catch { return null; } };
  const handle = (a, re, reserved) => {
    const u = url(a); if (!u) return null;
    const m = u.pathname.match(re); if (!m) return null;
    const name = m[1].toLowerCase();
    return reserved.has(name) ? null : name;
  };
  const set = s => new Set(s.split(" "));
  const headIs = (c, words) => words.includes(FC.norm((c.innerText || "").split("\n")[0]));

  const P = {};

  // ---------------- Instagram ----------------
  const igRes = set("explore reels reel direct accounts stories p tv about legal web api challenge emails");
  P.instagram = {
    id: "instagram", name: "Instagram", hosts: ["instagram.com"], api: true,
    modes: ["removeNonFollowing", "unfollowNonFollowers", "removeBots", "unfollowAll"],
    userFromAnchor: a => handle(a, /^\/([A-Za-z0-9._]+)\/?$/, igRes),
    lists: {
      followers: { open: "your profile > Followers", rowWords: L.remove },
      following: { open: "your profile > Following", rowWords: L.following }
    },
    headingOk: (c, list) => !headIs(c, list === "followers" ? L.followingHead : L.followersHead),
    actions: {
      removeFollower: { prompt: /remove (this )?follower/,
        steps: [{ from: "row", words: L.remove }, { from: "layer", words: L.remove }] },
      unfollow: { prompt: /unfollow/,
        steps: [{ from: "row", words: L.following }, { from: "layer", words: L.unfollow }] }
    }
  };

  // ---------------- X (Twitter) ----------------
  const xRes = set("home explore notifications messages i settings search compose login signup tos privacy jobs");
  P.x = {
    id: "x", name: "X", hosts: ["x.com", "twitter.com"],
    modes: ["removeNonFollowing", "unfollowNonFollowers", "removeBots", "unfollowAll"],
    rowSelector: '[data-testid="UserCell"]',
    userFromAnchor: a => handle(a, /^\/([A-Za-z0-9_]{1,15})$/, xRes),
    pageList: list => new RegExp("/(verified_)?" + list + "$").test(location.pathname),
    lists: {
      followers: { open: "your profile > Followers (the page with the list)", rowWords: L.following.concat(L.follow) },
      following: { open: "your profile > Following (the page with the list)", rowWords: L.following }
    },
    actions: {
      removeFollower: { prompt: /remove (this )?follower/,
        steps: [
          { from: "row", words: L.more, selector: '[data-testid="userActions"]' },
          { from: "layer", words: L.removeMenu },
          { from: "layer", words: L.remove, selector: '[data-testid="confirmationSheetConfirm"]' }
        ] },
      unfollow: { prompt: /unfollow/,
        steps: [
          { from: "row", words: L.following, selector: '[data-testid$="-unfollow"]' },
          { from: "layer", words: L.unfollow, selector: '[data-testid="confirmationSheetConfirm"]' }
        ] }
    }
  };

  // ---------------- TikTok ----------------
  P.tiktok = {
    id: "tiktok", name: "TikTok", hosts: ["tiktok.com"],
    modes: ["removeNonFollowing", "unfollowNonFollowers", "removeBots", "unfollowAll"],
    containerSelector: '[data-e2e="follow-info-popup"]',
    userFromAnchor: a => handle(a, /^\/@([A-Za-z0-9._]+)\/?$/, new Set()),
    lists: {
      followers: { open: "your profile > Followers", rowWords: L.friends.concat(L.follow, L.more) },
      following: { open: "your profile > Following", rowWords: L.following.concat(L.friends) }
    },
    actions: {
      removeFollower: { prompt: /remove/,
        steps: [
          { from: "row", words: L.more },
          { from: "layer", words: L.removeMenu },
          { from: "layer", words: L.remove, optional: true }
        ] },
      unfollow: { prompt: /unfollow|following/,
        steps: [
          { from: "row", words: L.following.concat(L.friends) },
          { from: "layer", words: L.unfollow, optional: true }
        ] }
    }
  };

  // ---------------- Facebook (limited) ----------------
  const fbRes = set("groups watch marketplace events friends gaming pages notifications messages bookmarks stories reel reels settings help policies");
  P.facebook = {
    id: "facebook", name: "Facebook", hosts: ["facebook.com"],
    modes: ["unfollowAll"],
    userFromAnchor: a => {
      const u = url(a); if (!u) return null;
      if (u.pathname === "/profile.php") return u.searchParams.get("id");
      const m = u.pathname.match(/^\/([A-Za-z0-9.]{5,})\/?$/);
      return m && !fbRes.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
    },
    lists: {
      following: { open: "your profile > Friends > Following", rowWords: L.following },
      followers: { open: "your followers list", rowWords: L.following }
    },
    actions: {
      unfollow: { prompt: /unfollow/,
        steps: [
          { from: "row", words: L.following },
          { from: "layer", words: L.unfollow },
          { from: "layer", words: L.confirm, optional: true }
        ] }
    }
  };

  // ---------------- Generic fallback (add the site to manifest.json "matches" to use it) ----------------
  P.generic = {
    id: "generic", name: location.hostname.replace(/^www\./, ""), hosts: [], generic: true,
    modes: ["removeNonFollowing", "unfollowNonFollowers", "unfollowAll"],
    userFromAnchor: a => handle(a, /^\/@?([A-Za-z0-9._-]{2,})\/?$/, set("home explore search settings login signup about help")),
    lists: {
      followers: { open: "the followers list", rowWords: L.remove.concat(L.follow, L.friends, L.following) },
      following: { open: "the following list", rowWords: L.following.concat(L.friends) }
    },
    actions: {
      removeFollower: { prompt: /remove/,
        steps: [{ from: "row", words: L.remove.concat(L.more) }, { from: "layer", words: L.removeMenu.concat(L.remove), optional: true }, { from: "layer", words: L.remove, optional: true }] },
      unfollow: { prompt: /unfollow/,
        steps: [{ from: "row", words: L.following.concat(L.friends) }, { from: "layer", words: L.unfollow, optional: true }] }
    }
  };

  FC.platforms = P;
  FC.detectPlatform = () => {
    const h = location.hostname;
    const hit = Object.values(P).find(p => p.hosts.some(x => h === x || h.endsWith("." + x)));
    return hit || P.generic;
  };
})();
