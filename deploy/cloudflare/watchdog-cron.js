const REPOSITORY = '2401055/prism-quest-playwright-watchdog'
const WORKFLOW = 'watchdog.yml'

function githubHeaders(env) {
  return { accept: 'application/vnd.github+json', authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`, 'content-type': 'application/json', 'user-agent': 'prism-quest-cloudflare-watchdog', 'x-github-api-version': '2022-11-28' }
}

async function dispatch(env, delay = 0) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', headers: githubHeaders(env), body: JSON.stringify({ ref: 'main', inputs: { start_delay_ms: String(delay) } }) })
  if (!response.ok) throw new Error(`GitHub dispatch failed: HTTP ${response.status}`)
}

async function runs(env) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=10`, { headers: githubHeaders(env) })
  if (!response.ok) throw new Error(`GitHub runs lookup failed: HTTP ${response.status}`)
  return (await response.json()).workflow_runs || []
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`)
}

export default {
  async scheduled(_event, env) {
    if (!env.GITHUB_DISPATCH_TOKEN) throw new Error('GITHUB_DISPATCH_TOKEN is not configured')
    const active = (await runs(env)).find(run => ['queued', 'in_progress'].includes(run.status))
    const age = active ? Date.now() - Date.parse(active.created_at) : Infinity
    const lead = 10 * 60 * 1000
    const max = (4 * 60 + 59) * 60 * 1000 + 50 * 1000
    if (active && age < max - lead) return
    const delay = active ? Math.max(0, max - age - 120000) : 0
    await dispatch(env, delay)
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS' && url.pathname === '/whip') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'Content-Type' } })
    if (request.method === 'POST' && url.pathname === '/whip') {
      if (!env.WHIP_URL) return new Response('WHIP proxy is not configured', { status: 503 })
      const upstream = await fetch(env.WHIP_URL, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: await request.arrayBuffer() })
      const headers = new Headers(upstream.headers)
      headers.set('access-control-allow-origin', '*')
      headers.set('access-control-expose-headers', 'Location')
      return new Response(upstream.body, { status: upstream.status, headers })
    }
    if (request.method === 'GET' && url.pathname === '/setup') {
      if (!env.TELEGRAM_BOT_TOKEN) return new Response('Add TELEGRAM_BOT_TOKEN to Worker Secrets first.', { status: 503 })
      const webhook = `${url.origin}/telegram`
      const body = { url: webhook }
      if (env.TELEGRAM_WEBHOOK_SECRET) body.secret_token = env.TELEGRAM_WEBHOOK_SECRET
      const response = await telegram(env, 'setWebhook', body)
      return new Response(JSON.stringify({ ok: true, webhook, telegram: response }), { headers: { 'content-type': 'application/json' } })
    }
    if (request.method === 'GET') return new Response(JSON.stringify({ ok: true, service: 'prism-quest-watchdog-cron', setup: `${url.origin}/setup` }), { headers: { 'content-type': 'application/json' } })
    if (request.method !== 'POST' || url.pathname !== '/telegram') return new Response('Not found', { status: 404 })
    if (env.TELEGRAM_WEBHOOK_SECRET && request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('Unauthorized', { status: 401 })
    if (!env.TELEGRAM_BOT_TOKEN || !env.GITHUB_DISPATCH_TOKEN) return new Response('Bot is not configured', { status: 503 })
    const update = await request.json()
    const message = update.message
    const chatId = message?.chat?.id
    if (!chatId || (env.TELEGRAM_CHAT_ID && String(chatId) !== String(env.TELEGRAM_CHAT_ID))) return new Response('ok')
    const command = String(message.text || '').trim().split(/\s+/, 1)[0].toLowerCase()
    try {
      if (command === '/start' || command === '/play' || command === '/restart') {
        await dispatch(env, 0)
        await telegram(env, 'sendMessage', { chat_id: chatId, text: 'Playwright broadcast start/restart requested.' })
      } else if (command === '/stop') {
        const active = (await runs(env)).find(run => ['queued', 'in_progress'].includes(run.status))
        if (active) await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/runs/${active.id}/cancel`, { method: 'POST', headers: githubHeaders(env) })
        await telegram(env, 'sendMessage', { chat_id: chatId, text: active ? 'Broadcast stop requested.' : 'No active broadcast runner found.' })
      } else if (command === '/status') {
        const active = (await runs(env)).find(run => ['queued', 'in_progress'].includes(run.status))
        await telegram(env, 'sendMessage', { chat_id: chatId, text: active ? `Runner: ${active.status}\nStarted: ${active.created_at}` : 'No active Playwright runner found.' })
      } else {
        await telegram(env, 'sendMessage', { chat_id: chatId, text: '/start — start\n/stop — stop\n/restart — restart\n/status — status' })
      }
    } catch (error) {
      await telegram(env, 'sendMessage', { chat_id: chatId, text: `Watchdog error: ${error.message}` })
    }
    return new Response('ok')
  },
}
