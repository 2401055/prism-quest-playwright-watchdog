import { chromium } from 'playwright'

const BROADCAST_URL = process.env.BROADCAST_URL || 'https://prism-quest-broadcast.pages.dev/broadcast'
const WHIP_URL = process.env.WHIP_URL
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const HEADLESS = process.env.HEADLESS !== '0'
const RESTART_MS = Number(process.env.RESTART_MS || 10000)

if (!WHIP_URL) throw new Error('WHIP_URL is required; never commit it to Git')
const MAX_RUNTIME_MS = Number(process.env.MAX_RUNTIME_MS || 0)

let browser
let page
let running = false
let stopping = false
let updateOffset = 0

const api = method => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`

async function telegram(method, body) {
  const response = await fetch(api(method), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`)
  const data = await response.json()
  if (!data.ok) throw new Error(`Telegram API: ${data.description || 'unknown error'}`)
  return data.result
}

async function notify(text) {
  if (!TELEGRAM_CHAT_ID) return
  await telegram('sendMessage', { chat_id: TELEGRAM_CHAT_ID, text }).catch(error => console.error('[telegram]', error.message))
}

function allowed(chatId) {
  return !TELEGRAM_CHAT_ID || String(chatId) === String(TELEGRAM_CHAT_ID)
}

async function closeBrowser() {
  running = false
  if (browser) await browser.close().catch(() => undefined)
  browser = undefined
  page = undefined
}

async function startBrowser() {
  if (running) return 'already running'
  stopping = false
  browser = await chromium.launch({
    headless: HEADLESS,
    args: ['--disable-dev-shm-usage', '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'],
  })
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  page.on('close', () => { running = false })
  await page.goto(BROADCAST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('#whip').fill(WHIP_URL)
  await page.locator('#start').click()
  await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Connected'), null, { timeout: 30000 }).catch(() => undefined)
  running = true
  const status = await page.locator('#status').textContent()
  await notify(`Prism Quest broadcast: ${status || 'started'}`)
  return status || 'started'
}

async function restartBrowser() {
  await closeBrowser()
  if (!stopping) setTimeout(() => startBrowser().catch(error => { console.error('[browser]', error); void notify(`Broadcast restart failed: ${error.message}`) }), RESTART_MS)
}

async function statusText() {
  if (!page) return 'stopped'
  return (await page.locator('#status').textContent().catch(() => 'unknown')) || 'unknown'
}

async function handleCommand(message) {
  const chatId = message.chat?.id
  if (!allowed(chatId)) return
  const command = String(message.text || '').trim().split(/\s+/, 1)[0].toLowerCase()
  if (command === '/start' || command === '/play') {
    const result = await startBrowser()
    await telegram('sendMessage', { chat_id: chatId, text: `Broadcast: ${result}` })
  } else if (command === '/stop') {
    stopping = true; await closeBrowser()
    await telegram('sendMessage', { chat_id: chatId, text: 'Broadcast stopped.' })
  } else if (command === '/status') {
    await telegram('sendMessage', { chat_id: chatId, text: `Browser: ${running ? 'running' : 'stopped'}\nCloudflare: ${await statusText()}` })
  } else if (command === '/restart') {
    stopping = false; await restartBrowser()
    await telegram('sendMessage', { chat_id: chatId, text: 'Broadcast restart requested.' })
  } else if (command === '/help') {
    await telegram('sendMessage', { chat_id: chatId, text: '/start or /play — start\n/stop — stop\n/restart — restart\n/status — status' })
  }
}

async function pollTelegram() {
  if (!TELEGRAM_BOT_TOKEN) return
  while (!stopping) {
    try {
      const updates = await telegram('getUpdates', { timeout: 45, offset: updateOffset, allowed_updates: ['message'] })
      for (const update of updates) { updateOffset = update.update_id + 1; await handleCommand(update.message).catch(error => console.error('[command]', error.message)) }
    } catch (error) {
      console.error('[telegram poll]', error.message)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

process.on('SIGINT', async () => { stopping = true; await closeBrowser(); process.exit(0) })
process.on('SIGTERM', async () => { stopping = true; await closeBrowser(); process.exit(0) })

await startBrowser()
void pollTelegram()
if (MAX_RUNTIME_MS > 0) setTimeout(async () => { stopping = true; await closeBrowser(); process.exit(0) }, MAX_RUNTIME_MS)
setInterval(async () => {
  if (!running || !page || stopping) return
  const text = await statusText()
  if (/failed|disconnected|stopped/i.test(text)) await restartBrowser()
}, 15000)
