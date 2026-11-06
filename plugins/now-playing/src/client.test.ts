import { assert, test } from 'orca/testing'
import { SpotifyClient, SpotifyError, type FetchFn } from './client'

type Reply = { status: number; body?: unknown; retryAfter?: string }

function harness(replies: Reply[], refresh: string | null = 'r1') {
  const calls: { url: string; method: string; body?: string; auth?: string }[] = []
  let stored = refresh
  let clock = 0
  const fetch: FetchFn = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body, auth: init?.headers?.authorization })
    const reply = replies.shift() ?? { status: 500 }
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      headers: { get: (name: string) => (name === 'retry-after' ? (reply.retryAfter ?? null) : null) },
      json: async () => reply.body ?? null,
      arrayBuffer: async () => new ArrayBuffer(0)
    }
  }
  const client = new SpotifyClient({
    fetch,
    now: () => clock,
    clientId: async () => 'cid',
    vault: { get: async () => stored, set: async (value) => void (stored = value), clear: async () => void (stored = null) }
  })
  return { client, calls, stored: () => stored, advance: (ms: number) => void (clock += ms) }
}

const token = (access: string, refresh?: string): Reply => ({ status: 200, body: { access_token: access, expires_in: 3600, ...(refresh ? { refresh_token: refresh } : {}) } })

test('the first call refreshes, then reuses the access token until it nears expiry', async () => {
  const h = harness([token('a1', 'r2'), { status: 200, body: { x: 1 } }, { status: 200, body: { x: 2 } }, token('a2'), { status: 200, body: { x: 3 } }])
  assert.deepEqual(await h.client.get('/me'), { x: 1 })
  assert.equal(h.stored(), 'r2')
  assert.deepEqual(await h.client.get('/me'), { x: 2 })
  assert.equal(h.calls.filter((c) => c.url.includes('/api/token')).length, 1)
  h.advance(3600_000 - 59_000)
  assert.deepEqual(await h.client.get('/me'), { x: 3 })
  assert.equal(h.calls.filter((c) => c.url.includes('/api/token')).length, 2)
  assert.equal(h.calls[h.calls.length - 1].auth, 'Bearer a2')
  assert.ok(h.calls[0].body?.includes('grant_type=refresh_token'))
  assert.ok(h.calls[0].body?.includes('refresh_token=r1'))
})

test('a 401 refreshes once and retries the call', async () => {
  const h = harness([token('a1'), { status: 401 }, token('a2'), { status: 200, body: { ok: true } }])
  assert.deepEqual(await h.client.get('/me/player'), { ok: true })
  assert.equal(h.calls.length, 4)
})

test('a 204 answer is null', async () => {
  const h = harness([token('a1'), { status: 204 }])
  assert.equal(await h.client.get('/me/player'), null)
})

test('a dead refresh token signs out', async () => {
  const h = harness([{ status: 400, body: { error: 'invalid_grant' } }])
  const error = await h.client.get('/me').catch((e: unknown) => e)
  assert.ok(error instanceof SpotifyError)
  assert.equal(error.signedOut, true)
  assert.equal(h.stored(), null)
})

test('a failed refresh for another reason keeps the refresh token', async () => {
  const h = harness([{ status: 503 }])
  const error = await h.client.get('/me').catch((e: unknown) => e)
  assert.ok(error instanceof SpotifyError)
  assert.equal(error.signedOut, false)
  assert.equal(h.stored(), 'r1')
})

test('not signed in never calls Spotify', async () => {
  const h = harness([], null)
  const error = await h.client.get('/me').catch((e: unknown) => e)
  assert.ok(error instanceof SpotifyError && error.signedOut)
  assert.equal(h.calls.length, 0)
})

test('an API error carries the friendly message', async () => {
  const h = harness([token('a1'), { status: 404, body: { error: { reason: 'NO_ACTIVE_DEVICE' } } }])
  const error = await h.client.call({ method: 'PUT', path: '/me/player/play' }).catch((e: unknown) => e)
  assert.ok(error instanceof SpotifyError)
  assert.equal(error.message, 'No device is open. Open Spotify on your Mac or phone.')
})

test('exchange stores the refresh token', async () => {
  const h = harness([token('a1', 'fresh')], null)
  await h.client.exchange('code', 'verifier', 'http://127.0.0.1:8888/callback')
  assert.equal(h.stored(), 'fresh')
  assert.ok(h.calls[0].body?.includes('code_verifier=verifier'))
})

test('a 429 waits out Retry-After without calling Spotify again', async () => {
  const h = harness([token('a1'), { status: 429, retryAfter: '7' }, { status: 200, body: { ok: true } }])
  const first = await h.client.get('/me/player').catch((e: unknown) => e)
  assert.ok(first instanceof SpotifyError && first.status === 429)
  assert.equal(first.message, 'Spotify asked us to slow down. Trying again in 7s.')
  const calls = h.calls.length
  h.advance(6_000)
  const second = await h.client.get('/me/player').catch((e: unknown) => e)
  assert.ok(second instanceof SpotifyError && second.status === 429)
  assert.equal(h.calls.length, calls)
  h.advance(1_500)
  assert.deepEqual(await h.client.get('/me/player'), { ok: true })
})
