# Prism Quest Playwright Watchdog

A standalone public repository that opens Chromium with Playwright, starts the public Prism Quest broadcaster page, monitors Cloudflare WHIP, and restarts the browser when the connection fails.

The private game source is not included. Secrets are supplied through GitHub Actions Secrets.

## Setup

Add this repository secret:

```text
WHIP_URL=https://customer-...cloudflarestream.com/.../webRTC/publish
```

Do not commit or publish the value. Then open **Actions → Prism Quest Playwright watchdog → Run workflow**.

The workflow also runs every six hours. Each run exits before GitHub's six-hour runner limit and the next scheduled run opens a fresh browser. Cloudflare Stream must have a YouTube output attached to the same Live Input.

This free fallback can have a short gap if GitHub delays a scheduled run. It does not require a VPS or Oracle VM. Telegram control is optional and is disabled when `TELEGRAM_BOT_TOKEN` is absent.
