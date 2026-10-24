# IG Follower Cleaner

A lightweight Chrome extension (Manifest V3) that finds followers you don't follow back and removes them from your followers list slowly, with randomized delays and built-in safety limits.

## Features

- Scans your followers and following lists, then shows who doesn't get followed back
- Keep-list for accounts you want to protect
- Skips verified accounts by default
- Randomized delays between actions (30-75 seconds)
- Longer rest after every batch (4-8 minutes)
- Optional daily cap (off by default), persisted across page reloads
- Stops immediately on any error from Instagram
- Runs entirely in your own logged-in browser session. No data leaves your machine.

## Install

1. Clone or download this repo.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder (it must contain `manifest.json`).
4. Open [instagram.com](https://www.instagram.com) while logged in. A panel appears in the bottom-right corner.

## Usage

1. (Optional) Enter usernames to keep, one per line.
2. Click **Scan** and wait for it to finish.
3. Open your profile and click **Followers** so the list is open on screen.
4. Click **Start**. The first run is limited to 3 removals as a test. Once it works, set "Limit this run" to 0 to remove everyone. Use **Stop** at any time.

Scanning uses read-only requests. Removals are done through the Followers list on screen, clicking Remove and confirming, the same way you would by hand.

## Configuration

Edit the `CFG` object at the top of `content.js`:

| Option | Default | Description |
| --- | --- | --- |
| `removeDelay` | 30-75 s | Random pause between removals |
| `batchSize` | 8 | Removals before a longer rest |
| `batchRest` | 4-8 min | Length of the longer rest |
| `dailyCap` | 0 | Maximum removals per day (0 = no cap) |
| `skipVerified` | true | Never remove verified accounts |

## Disclaimer

This project automates actions on Instagram, which is against Instagram's Terms of Use. No delay setting can guarantee your account won't be restricted. It relies on unofficial web endpoints that may change at any time. Use it at your own risk, keep the daily cap low, and stop if you see an "action blocked" message. This project is not affiliated with or endorsed by Instagram or Meta.

## License

MIT
