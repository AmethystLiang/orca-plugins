import test from 'node:test'
import assert from 'node:assert/strict'
import '../panel/format.js'

const F = globalThis.AMFormat
const hm = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

test('15 minute clock ticks land on round five minute marks at their true positions', () => {
  const ticks = F.clockTicks(900, Date.parse('2026-11-08T14:32:00'))
  assert.deepEqual(ticks.map((t) => t.label), [hm('2026-11-08T14:20:00'), hm('2026-11-08T14:25:00'), hm('2026-11-08T14:30:00')])
  const want = [0.2, 0.533, 0.867]
  ticks.forEach((t, i) => assert.ok(Math.abs(t.frac - want[i]) < 0.001, t.frac + ' vs ' + want[i]))
})

test('24 hour clock ticks are three or four local six hour marks inside the window', () => {
  const ticks = F.clockTicks(86400, Date.parse('2026-11-08T14:32:00'))
  assert.ok(ticks.length >= 3 && ticks.length <= 4, String(ticks.length))
  ticks.forEach((t) => assert.ok(t.frac > 0 && t.frac < 1))
  assert.deepEqual(ticks.map((t) => t.label), [hm('2026-11-07T18:00:00'), hm('2026-11-08T00:00:00'), hm('2026-11-08T06:00:00'), hm('2026-11-08T12:00:00')])
})

test('every history span gets two to four ticks with distinct labels', () => {
  const now = Date.parse('2026-11-08T14:32:17')
  ;[59, 60, 299, 300, 900, 3600, 21600, 86400].forEach((span) => {
    const ticks = F.clockTicks(span, now)
    assert.ok(ticks.length >= 2 && ticks.length <= 4, span + ': ' + ticks.length)
    assert.equal(new Set(ticks.map((t) => t.label)).size, ticks.length, span + ' has duplicate labels')
    ticks.forEach((t, i) => {
      assert.ok(t.frac > 0 && t.frac < 1)
      if (i) assert.ok(t.frac > ticks[i - 1].frac)
    })
  })
})
