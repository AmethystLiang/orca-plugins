import test from 'node:test'
import assert from 'node:assert/strict'
import { createTracker } from '../src/tracker.ts'

const MB = 1024 ** 2
const GB = 1024 ** 3
const START = 'Thu Nov 5 09:02:44 2026'

function feed(tracker, clock, seconds, make) {
  for (let s = 0; s <= seconds; s += 15) {
    clock.t = s * 1000
    tracker.add(make(s))
  }
}

test('steady 90% cpu over 5 minutes averages about 90', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  feed(tracker, clock, 300, () => [{ pid: 7, cpu: 90, mem: 100 * MB, name: 'node', start: START }])
  const s = tracker.stats(7, START)
  assert.ok(Math.abs(s.cpuAvg5m - 90) < 0.01)
})

test('cpu average needs most of the 5 minute window', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  feed(tracker, clock, 60, () => [{ pid: 7, cpu: 90, mem: 100 * MB, name: 'node', start: START }])
  assert.equal(tracker.stats(7, START).cpuAvg5m, null)
})

test('memory rising from 1 GB to 1.6 GB over 10 minutes is reported as growth', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  feed(tracker, clock, 600, (s) => [{ pid: 9, cpu: 1, mem: GB + (0.6 * GB * s) / 600, name: 'node', start: START }])
  const g = tracker.stats(9, START).memGrowth10m
  assert.ok(Math.abs(g.bytes - 0.6 * GB) < MB)
  assert.ok(Math.abs(g.ratio - 0.6) < 0.001)
})

test('memory growth needs most of the 10 minute window', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  feed(tracker, clock, 300, (s) => [{ pid: 9, cpu: 1, mem: GB + MB * s, name: 'node', start: START }])
  assert.equal(tracker.stats(9, START).memGrowth10m, null)
})

test('stats are keyed by pid and start time', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  feed(tracker, clock, 300, () => [{ pid: 7, cpu: 90, mem: 100 * MB, name: 'node', start: START }])
  assert.deepEqual(tracker.stats(7, 'Fri Nov 6 10:00:00 2026'), { cpuAvg5m: null, memGrowth10m: null })
  assert.deepEqual(tracker.stats(8, START), { cpuAvg5m: null, memGrowth10m: null })
})

test('null cpu samples are skipped in the average', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  feed(tracker, clock, 300, (s) => [{ pid: 7, cpu: s % 30 === 0 ? null : 80, mem: MB, name: 'node', start: START }])
  assert.equal(tracker.stats(7, START).cpuAvg5m, 80)
})

test('pids that leave the list are dropped', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  tracker.add([{ pid: 1, cpu: 1, mem: MB, name: 'a', start: START }, { pid: 2, cpu: 1, mem: MB, name: 'b', start: START }])
  clock.t = 15_000
  tracker.add([{ pid: 1, cpu: 1, mem: MB, name: 'a', start: START }])
  assert.equal(tracker.size(), 1)
})

test('300 pids are capped at 200 and a small busy pid keeps its history', () => {
  const clock = { t: 0 }
  const tracker = createTracker(() => clock.t)
  const procs = (s) => {
    const list = []
    for (let i = 0; i < 300; i++) list.push({ pid: 1000 + i, cpu: 0, mem: (500 + i) * MB, name: 'big', start: START })
    list.push({ pid: 42, cpu: 95, mem: 60 * MB, name: 'node', start: START })
    return list
  }
  feed(tracker, clock, 300, procs)
  assert.ok(tracker.size() <= 200)
  assert.ok(Math.abs(tracker.stats(42, START).cpuAvg5m - 95) < 0.01)
})
