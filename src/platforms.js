// Platform adapters. Each one only says WHAT to look for (labels, hints, URL shapes).
// The generic engine in core.js does the finding and clicking.
(() => {
  const FC = window.FC, L = FC.LABELS;

  // What a person can ask the tool to do.
  FC.MODES = {
    removeNonFollowing:   { title: "Remove followers I don't follow back", list: "followers", action: "removeFollower", verb: "remove", past: "Removed" },
    unfollowNonFollowers: { title: "Unfollow people who don't follow me back", list: "following", action: "unfollow", verb: "unfollow", past: "Unfollowed" },
    removeBots:           { title: "Remove bot-like followers", list: "followers", action: "removeFollower", verb: "remove", past: "Removed" },
    unfollowAll:          { title: "Unfollow everyone in the list", list: "following", action: "unfollow", verb: "unfollow", past: "Unfollowed", warn: true },
    unfollowFriends:      { title: "Unfollow friends (stay friends, hide their posts)", list: "friends", action: "unfollowFriend", verb: "unfollow", past: "Unfollowed" },
    unfriendNoMutual:     { title: "Unfriend people with no mutual friends", list: "friends", action: "unfriend", verb: "unfriend", past: "Unfriended", warn: true },
    unfriendAll:          { title: "Unfriend everyone in the list", list: "friends", action: "unfriend", verb: "unfriend", past: "Unfriended", warn: true }
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
    skip: '[data-testid="sidebarColumn"], aside, [aria-label="Who to follow"]',
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
    anyContainer: true,
    userFromAnchor: a => handle(a, /^\/@([A-Za-z0-9._]+)\/?$/, new Set()),
    lists: {
      followers: { open: "your profile > Followers", rowWords: L.friends.concat(L.follow, L.more) },
      following: { open: "your profile > Following", rowWords: L.following.concat(L.friends) }
    },
    actions: {
      removeFollower: { prompt: /remove/,
        steps: [
          // variant A: a direct "Remove" button in the row
          [{ from: "row", words: L.remove }, { from: "layer", words: L.remove, optional: true }],
          // variant B: the row's "..." menu, then "Remove this follower"
          [{ from: "row", words: L.more }, { from: "layer", words: L.removeMenu }, { from: "layer", words: L.remove, optional: true }]
        ] },
      unfollow: { prompt: /unfollow|following/,
        steps: [
          { from: "row", words: L.following.concat(L.friends) },
          { from: "layer", words: L.unfollow, optional: true }
        ] }
    }
  };

  // ---------------- Facebook ----------------
  // Real flow (Friends > All friends): each row has a "..." button that opens a menu
  // (Favourites, Edit Friend List, Unfollow, Unfriend). Unfriend asks for a "Confirm".
  const fbRes = set("groups watch marketplace events friends gaming pages notifications messages bookmarks stories reel reels settings help policies me home.php hashtag search ads privacy terms");
  P.facebook = {
    id: "facebook", name: "Facebook", hosts: ["facebook.com"],
    modes: ["unfollowFriends", "unfriendNoMutual", "unfriendAll"],
    menuRows: true, anyContainer: true,
    userFromAnchor: a => {
      const u = url(a); if (!u) return null;
      if (u.pathname === "/profile.php") return u.searchParams.get("id");
      const m = u.pathname.match(/^\/([A-Za-z0-9.]{3,})\/?$/);
      return m && !fbRes.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
    },
    pageList: () => true,
    lists: {
      friends: { open: "your profile > Friends > All friends", rowWords: L.more }
    },
    actions: {
      unfollowFriend: { prompt: /unfollow/, verifyByClose: true,
        steps: [
          { from: "row", words: L.more, selector: '[aria-haspopup="menu"]' },
          { from: "layer", words: L.unfollow }
        ] },
      unfriend: { prompt: /unfriend/,
        steps: [
          { from: "row", words: L.more, selector: '[aria-haspopup="menu"]' },
          { from: "layer", words: L.unfriend },
          { from: "layer", words: L.confirm, needName: true }
        ] }
    }
  };

  // ---------------- Generic fallback (add the site to manifest.json "matches" to use it) ----------------
  P.generic = {
    id: "generic", name: location.hostname.replace(/^www\./, ""), hosts: [], generic: true, anyContainer: true,
    modes: ["removeNonFollowing", "unfollowNonFollowers", "unfollowAll"],
    userFromAnchor: a => handle(a, /^\/@?([A-Za-z0-9._-]{2,})\/?$/, set("home explore search settings login signup about help")),
    lists: {
      followers: { open: "the followers list", rowWords: L.remove.concat(L.follow, L.friends, L.following) },
      following: { open: "the following list", rowWords: L.following.concat(L.friends) }
    },
    actions: {
      removeFollower: { prompt: /remove/,
        steps: [
          [{ from: "row", words: L.remove }, { from: "layer", words: L.remove, optional: true }],
          [{ from: "row", words: L.more }, { from: "layer", words: L.removeMenu }, { from: "layer", words: L.remove, optional: true }]
        ] },
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
