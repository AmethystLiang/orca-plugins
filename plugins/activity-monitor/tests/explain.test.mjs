import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPrompt, clean, pickAgent } from '../src/explain.ts'

const agent = (terminalId, state, at, title = 'Claude') => ({ terminalId, title, agent: 'claude', state, stateStartedAt: at })

test('prompt is one line with the facts the panel knows', () => {
  const p = buildPrompt({ pid: 92541, name: 'Orca', cpu: 12.345, mem: 1.5 * 1024 ** 3, threads: 40, user: 'aamon', start: 'Thu Nov  6 09:00:00 2026', platform: 'darwin' }, '/Applications/Orca.app/Contents/MacOS/Orca')
  assert.ok(!/[\r\n]/.test(p))
  assert.match(p, /"Orca" running on my macOS/)
  assert.match(p, /PID 92541, path \/Applications\/Orca\.app\/Contents\/MacOS\/Orca, 12\.3% CPU, 1\.5 GB memory, 40 threads, user aamon, started Thu Nov 6 09:00:00 2026/)
  assert.match(p, /Do not quit it or change anything\.$/)
})

test('control characters and escape sequences in a name are stripped', () => {
  const p = buildPrompt({ pid: 7, name: 'evil\n\x1b[2Jrm -rf ~\r\x07' }, 'x\ny')
  assert.ok(!/[\u0000-\u001f\u007f]/.test(p))
  assert.match(p, /"evil \[2Jrm -rf ~"/)
  assert.equal(clean('a b\u0085c'), 'a b c')
})

test('long names are capped', () => {
  assert.equal(clean('x'.repeat(500)).length, 120)
})

test('path equal to the name is left out and missing numbers are skipped', () => {
  const p = buildPrompt({ pid: 5, name: 'node', cpu: null, mem: undefined }, 'node')
  assert.match(p, /\(PID 5\)/)
})

test('no pid or no name gives no prompt', () => {
  assert.equal(buildPrompt({ name: 'x' }), null)
  assert.equal(buildPrompt({ pid: 3, name: '\n' }), null)
})

test('idle agent is picked, newest first', () => {
  const r = pickAgent([agent('t1', 'working', 50), agent('t2', 'done', 10), agent('t3', 'waiting', 30, 'Codex')])
  assert.deepEqual(r, { ok: true, terminalId: 't3', title: 'Codex' })
})

test('blocked agents are never typed into', () => {
  const r = pickAgent([agent('t1', 'blocked', 99)])
  assert.equal(r.ok, false)
  assert.match(r.reason, /permission prompt/)
})

test('busy-only and agents without a terminal give a reason', () => {
  assert.match(pickAgent([agent('t1', 'working', 1)]).reason, /busy/)
  assert.match(pickAgent([agent(null, 'done', 1)]).reason, /No agent/)
  assert.match(pickAgent([]).reason, /No agent/)
})
