# Follower Cleaner

A Chrome extension (Manifest V3) that helps you review and clean up your followers and following on **Instagram, X, TikTok and Facebook**, at a human pace, with a review step before anything happens.

## What it can do

| Mode | What it does |
| --- | --- |
| Remove followers I don't follow back | Takes people who follow you, but you don't follow, off your followers list |
| Unfollow people who don't follow me back | Unfollows accounts that don't follow you back |
| Remove bot-like followers | Scores followers for bot-like signs, you approve the list |
| Unfollow everyone in the list | Unfollows everything in the open list except your keep list |

Other features: review list with per-account tick boxes, keep list, skip verified accounts, per-run limit, daily cap, CSV export, three speed profiles, a custom warning before Fast mode, live stats and a progress bar, and a read-only **Check** button for diagnostics.

## Platform support

| Platform | Remove followers | Unfollow non-followers | Bots | Unfollow all |
| --- | :---: | :---: | :---: | :---: |
| Instagram | yes | yes | yes | yes |
| X (Twitter) | yes (web only) | yes | yes | yes |
| TikTok | yes | yes | limited | yes |
| Facebook | no | no | no | yes |

Facebook doesn't show who follows you back and doesn't let you remove followers from a list, so only "Unfollow everyone in the list" is available there. Buttons and layouts change often, and X, TikTok and Facebook have not been tested as extensively as Instagram. If something doesn't work, press **Check** and open an issue with its output.

## How it finds buttons

It doesn't rely on fixed positions or class names. It looks for controls by what they say (button text, `aria-label`, `title`), in several languages, and falls back to plain text matching. The flow for one account is, for example on X: find the row, click its "More" button, wait for a "Remove this follower" menu item to appear, click it, then confirm with "Remove". Each popup is checked before confirming, and the tool stops if it doesn't look right.

The labels live in one place (`LABELS` in `src/core.js`) and the per-site steps are in `src/platforms.js`, so adding a language or fixing a changed label is a small edit.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and select the project folder (the one containing `manifest.json`).
3. Open the site while logged in. The panel appears in the bottom-right corner.

To use it on another site, add the site to `matches` in `manifest.json`. It will run in generic mode.

## Usage

1. Choose what you want to do and a speed.
2. Click **Scan**. On Instagram this uses read-only requests, on other sites it scrolls the open list and reads it.
3. Click **Review list**, untick anyone you want to keep.
4. Open the list shown in the hint (for example profile, Followers) and keep it on screen.
5. Click **Start**. The first run is limited to 3 accounts so you can check it behaves. Set the limit to 0 for no limit.

## Speeds

| Speed | Between actions | Rests |
| --- | --- | --- |
| Safe | 30-75 s | 4-8 min every 8 actions |
| Normal | 8-18 s | 2-4 min every 20 actions |
| Fast (unsafe) | under 1 s | none |

Fast mode shows a warning and needs an explicit confirmation. It is never turned on automatically when the page loads.

## Safety behavior

- Stops immediately if the site shows a limit or block message.
- Stops if a popup doesn't match the account it is acting on.
- Stops if three actions in a row can't be confirmed.
- Never touches your keep list or, by default, verified accounts.
- Everything runs inside your own logged-in browser. No data is sent anywhere else.

## Project layout

```
manifest.json
src/core.js        labels, button finder, row reader, action runner, bot scoring
src/platforms.js   Instagram, X, TikTok, Facebook and generic adapters
src/ui.js          panel, modals, review list
src/main.js        scan, review and act flow
```

## Disclaimer

This project automates actions on social platforms, which their terms of use generally prohibit. No setting can guarantee your account won't be limited or suspended. Bot detection is a heuristic and will make mistakes, so always review the list. It relies on page structure and unofficial endpoints that can change at any time. Use it at your own risk. This project is not affiliated with or endorsed by Instagram, Meta, X, or TikTok.

## License

MIT
