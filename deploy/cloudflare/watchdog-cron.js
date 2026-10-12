const REPOSITORY = '2401055/prism-quest-playwright-watchdog'
const WORKFLOW = 'watchdog.yml'

export default {
  async scheduled(_event, env) {
    if (!env.GITHUB_DISPATCH_TOKEN) throw new Error('GITHUB_DISPATCH_TOKEN is not configured')
    const headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      'content-type': 'application/json',
      'user-agent': 'prism-quest-cloudflare-watchdog',
      'x-github-api-version': '2022-11-28',
    }
    const runsResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?per_page=10`, { headers })
    if (!runsResponse.ok) throw new Error(`GitHub runs lookup failed: HTTP ${runsResponse.status}`)
    const data = await runsResponse.json()
    const active = (data.workflow_runs || []).find(run => ['queued', 'in_progress'].includes(run.status))
    const age = active ? Date.now() - Date.parse(active.created_at) : Infinity
    const leadMs = 10 * 60 * 1000
    const maxRunMs = (4 * 60 + 59) * 60 * 1000 + 50 * 1000
    if (active && age < maxRunMs - leadMs) return
    const startDelayMs = active ? Math.max(0, maxRunMs - age - 120000) : 0
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ref: 'main', inputs: { start_delay_ms: String(startDelayMs) } }),
    })
    if (!response.ok) throw new Error(`GitHub dispatch failed: HTTP ${response.status}`)
  },

  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    return new Response(JSON.stringify({ ok: true, service: 'prism-quest-watchdog-cron' }), { headers: { 'content-type': 'application/json' } })
  },
}
