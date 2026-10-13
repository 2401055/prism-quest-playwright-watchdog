# Prism Quest Playwright Watchdog

A standalone public repository that opens Chromium with Playwright, starts the public Prism Quest broadcaster page, monitors Cloudflare WHIP, and restarts the browser when the connection fails.

The private game source is not included. Secrets are supplied through GitHub Actions Secrets.

## Setup

The GitHub workflow uses the public Cloudflare WHIP proxy. The real WHIP URL is stored only as the `WHIP_URL` secret inside the Cloudflare Worker, so no WHIP secret is needed in GitHub. Then open **Actions → Prism Quest Playwright watchdog → Run workflow**.

The companion Cloudflare Worker Cron checks GitHub every minute. When the active Runner approaches 4 hours 50 minutes, it dispatches and pre-warms the next Runner while the current browser is still streaming. The next browser receives a calculated handoff delay, so the theoretical gap is near zero instead of waiting for a new Runner after the stream stops. Cloudflare Stream must have a YouTube output attached to the same Live Input.

This free fallback can still have a practical gap if GitHub runner provisioning takes longer than the warm-up window; overlapping publishers can also cause Cloudflare to switch connections. Cloudflare Cron removes GitHub's own schedule delay. It does not require a VPS or Oracle VM. Telegram control is optional and is disabled when `TELEGRAM_BOT_TOKEN` is absent.

## Cloudflare Cron setup

Deploy `wrangler.toml` and `deploy/cloudflare/watchdog-cron.js` as a Worker, then add the Worker secret `GITHUB_DISPATCH_TOKEN`. The token needs permission to dispatch this workflow (`Actions: write` on this repository). The Worker checks GitHub every minute and dispatches only when the current run is near its handoff point or has stopped.

## Telegram control without local code

Add these Worker Secrets:

```text
GITHUB_DISPATCH_TOKEN   (already required)
TELEGRAM_BOT_TOKEN      (from BotFather)
TELEGRAM_CHAT_ID        (optional; restricts control to your chat)
TELEGRAM_WEBHOOK_SECRET (optional private random text)
```

Set the Telegram webhook URL to:

```text
https://prism-quest-watchdog-cron.2401055.workers.dev/telegram
```

Then send `/start`, `/stop`, `/restart`, or `/status` to the bot. BotFather creates the bot identity; the Cloudflare Worker supplies the behavior.
