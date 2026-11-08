import test from 'node:test'
import assert from 'node:assert/strict'
import { createSampler } from '../src/sampler.ts'

const GB = 1024 ** 3
const START = 'Thu Nov 5 09:02:44 2026'

function stubProvider(over = {}) {
  return {
    diskPath: '/',
    diskName: 'Root (/)',
    countIrq: true,
    procEvery: 0,
    protectedNames: /^(launchd|loginwindow)$/,
    info: async () => ({ performance: [], efficiency: [], model: '' }),
    note: async () => null,
    read: async () => ({ memory: { total: 100, used: 25, app: 25, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net: null, disk: null, gpu: null }),
    procs: async () => null,
    identify: async () => null,
    quit: async () => ({ ok: true }),
    detailsEvery: 0,
    details: async () => null,
    cwds: async () => new Map(),
    args: async () => new Map(),
    ...over
  }
}

function quitter(identity) {
  const quits = []
  const provider = stubProvider({
    identify: async (pid) => (pid === 999 ? identity : null),
    quit: async (pid, force) => { quits.push([pid, force]); return { ok: true } }
  })
  return { quits, sampler: createSampler({ provider }) }
}

const changed = { ok: false, reason: 'That process changed; try again' }

test('quit refuses a request with no start time when the live process has one', async () => {
  const { quits, sampler } = quitter({ name: 'node', start: START })
  assert.deepEqual(await sampler.quit(999, 'node', null), changed)
  assert.deepEqual(await sampler.quit(999, 'node', null, true), changed)
  assert.deepEqual(await sampler.quit(999, 'node', ''), changed)
  assert.deepEqual(quits, [])
})

test('quit refuses a request with a start time when the live process has none', async () => {
  const { quits, sampler } = quitter({ name: 'node', start: null })
  assert.deepEqual(await sampler.quit(999, 'node', START), changed)
  assert.deepEqual(await sampler.quit(999, 'node', START, true), changed)
  assert.deepEqual(quits, [])
})

test('quit refuses a different start time on normal and force quit', async () => {
  const { quits, sampler } = quitter({ name: 'node', start: START })
  assert.deepEqual(await sampler.quit(999, 'node', 'Wed Nov 4 08:00:00 2026'), changed)
  assert.deepEqual(await sampler.quit(999, 'node', 'Wed Nov 4 08:00:00 2026', true), changed)
  assert.deepEqual(quits, [])
})

test('quit proceeds when the start time matches, or when neither side has one', async () => {
  const matched = quitter({ name: 'node', start: START })
  assert.deepEqual(await matched.sampler.quit(999, 'node', START), { ok: true })
  assert.deepEqual(await matched.sampler.quit(999, 'node', START, true), { ok: true })
  assert.deepEqual(matched.quits, [[999, false], [999, true]])
  const bare = quitter({ name: 'node', start: null })
  assert.deepEqual(await bare.sampler.quit(999, 'node', null), { ok: true })
  assert.deepEqual(bare.quits, [[999, false]])
})

test('quit keeps refusing Orca, its own pids, and protected names before identifying', async () => {
  const { quits, sampler } = quitter({ name: 'node', start: START })
  assert.deepEqual(await sampler.quit(1, 'launchd', null), { ok: false, reason: 'Not allowed' })
  assert.deepEqual(await sampler.quit(process.pid, 'node', START), { ok: false, reason: 'Not allowed' })
  assert.deepEqual(await sampler.quit(999, 'Orca Helper', START), { ok: false, reason: 'Quit Orca from its own menu' })
  assert.deepEqual(await sampler.quit(999, 'loginwindow', START, true), { ok: false, reason: 'Protected system process' })
  assert.deepEqual(quits, [])
})

test('a slow process list at lock-up risk does not hold up reads, and the culprit lands later', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let now = 0
  const provider = stubProvider({
    read: async () => ({ memory: { total: 16 * GB, used: 15.8 * GB, app: 0, wired: 0, compressed: 0, cached: 0 }, swap: 9 * GB, swapTotal: 10 * GB, pressure: 'critical', net: null, disk: null, gpu: null }),
    procs: async () => { await gate; return [{ pid: 4242, name: 'Hog', cpu: 1, mem: 6 * GB, start: START }] }
  })
  const alerts = []
  const sampler = createSampler({ provider, cpus: () => [], space: async () => null, settle: 0, clock: () => now, selfPids: [1, 2] })
  sampler.onAlert((alert) => alerts.push(alert))
  for (let i = 0; i < 40; i += 1) {
    now += 1000
    const started = Date.now()
    const out = await Promise.race([
      sampler.read({ interval: 100 }),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 500))
    ])
    assert.notEqual(out, 'blocked', 'read waited on the process list')
    assert.ok(Date.now() - started < 500)
    await new Promise((resolve) => setTimeout(resolve, 80))
    if (sampler.health().level === 'crit' || sampler.health().level === 'risk') break
  }
  assert.ok(['risk', 'crit'].includes(sampler.health().level), 'reached risk, got ' + sampler.health().level)
  assert.equal(sampler.health().culprit, null)
  release()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(sampler.health().culprit?.mem, 6 * GB)
  assert.ok(alerts.length > 0)
  assert.match(alerts[0].body, /is using/)
})
