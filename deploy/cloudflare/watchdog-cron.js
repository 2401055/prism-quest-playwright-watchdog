const REPOSITORY = '2401055/prism-quest-playwright-watchdog'
const WORKFLOW = 'watchdog.yml'

export default {
  async scheduled(_event, env) {
    if (!env.GITHUB_DISPATCH_TOKEN) throw new Error('GITHUB_DISPATCH_TOKEN is not configured')
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        'content-type': 'application/json',
        'user-agent': 'prism-quest-cloudflare-watchdog',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    })
    if (!response.ok) throw new Error(`GitHub dispatch failed: HTTP ${response.status}`)
  },

  async fetch(request, env, ctx) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    return new Response(JSON.stringify({ ok: true, service: 'prism-quest-watchdog-cron' }), { headers: { 'content-type': 'application/json' } })
  },
}
