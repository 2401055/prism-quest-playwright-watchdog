# Prism Quest Playwright Watchdog

A standalone public repository that opens Chromium with Playwright, starts the public Prism Quest broadcaster page, monitors Cloudflare WHIP, and restarts the browser when the connection fails.

The private game source is not included. Secrets are supplied through GitHub Actions Secrets.

## Setup

Add this repository secret:

```text
WHIP_URL=https://customer-...cloudflarestream.com/.../webRTC/publish
```

Do not commit or publish the value. Then open **Actions → Prism Quest Playwright watchdog → Run workflow**.

The workflow is dispatched by the companion Cloudflare Worker Cron every five hours. Each run exits after 4 hours 59 minutes 50 seconds, leaving a theoretical ten-second gap before the next runner. Cloudflare Stream must have a YouTube output attached to the same Live Input.

This free fallback can have a longer practical gap if GitHub runner provisioning is delayed; the ten-second figure is theoretical only. Cloudflare Cron removes GitHub's own schedule delay. It does not require a VPS or Oracle VM. Telegram control is optional and is disabled when `TELEGRAM_BOT_TOKEN` is absent.

## Cloudflare Cron setup

Deploy `wrangler.toml` and `deploy/cloudflare/watchdog-cron.js` as a Worker, then add the Worker secret `GITHUB_DISPATCH_TOKEN`. The token needs permission to dispatch this workflow (`Actions: write` on this repository). The Worker sends `workflow_dispatch` to GitHub every five hours.
