import test from 'node:test'
import assert from 'node:assert/strict'
import { createHistory } from '../src/history.ts'

const MIN = 60 * 1000
const HOUR = 60 * MIN

function feed(stepMs, durationMs, value = () => 50) {
  let now = 1_700_000_000_000
  const history = createHistory(() => now)
  let seq = 0
  for (let t = 0; t < durationMs; t += stepMs) {
    now += stepMs
    seq += 1
    const v = value(seq)
    history.push({ seq, at: now, total: v, cores: [v, v / 2], mem: v, down: v, up: v, read: v, write: v, gpu: v })
  }
  return { history, now: () => now, seq }
}

test('window over an hour of 1s points returns at most 600 averaged points inside the span', () => {
  const { history, now } = feed(1000, 2 * HOUR)
  const points = history.window(3600, 600)
  assert.ok(points.length > 0 && points.length <= 600)
  assert.ok(points[0].at >= now() - 3600 * 1000)
  for (const p of points) {
    assert.equal(p.total, 50)
    assert.equal(p.mem, 50)
    assert.deepEqual(p.cores, [50, 25])
  }
})

test('window bins average a varying series and carry the newest seq', () => {
  const { history, seq } = feed(1000, 10 * MIN, (n) => (n % 2 ? 0 : 100))
  const points = history.window(600, 60)
  assert.ok(points.length <= 60)
  assert.equal(points[points.length - 1].seq, seq)
  for (const p of points) assert.ok(p.total > 40 && p.total < 60)
})

test('thirty hours of 1s points stay bounded and keep only the last 24h', () => {
  const { history, now } = feed(1000, 30 * HOUR)
  assert.ok(history.size() <= 30000)
  const points = history.window(86400, 600)
  assert.ok(points.length > 0 && points.length <= 600)
  assert.ok(points[0].at >= now() - 24 * HOUR)
  assert.ok(points[0].at <= now() - 23 * HOUR)
})

test('since returns only raw points newer than the given seq', () => {
  const { history, seq } = feed(1000, 5 * MIN)
  const newer = history.since(seq - 3)
  assert.deepEqual(newer.map((p) => p.seq), [seq - 2, seq - 1, seq])
  assert.equal(history.since(seq).length, 0)
  assert.equal(history.since(0).length, 300)
})

test('since never returns bucketed points older than 15 minutes', () => {
  const { history, now } = feed(1000, 40 * MIN)
  const all = history.since(0)
  assert.ok(all.length <= 15 * 60)
  assert.ok(all[0].at >= now() - 15 * MIN)
})

test('100ms points for 20 minutes still cover at least 14.5 minutes of a 15 minute window', () => {
  const { history, now } = feed(100, 20 * MIN)
  const points = history.window(900, 600)
  assert.ok(points.length <= 600)
  assert.ok(now() - points[0].at >= 14.5 * MIN)
})
