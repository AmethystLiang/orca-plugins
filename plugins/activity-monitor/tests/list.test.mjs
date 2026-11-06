import test from 'node:test'
import assert from 'node:assert/strict'
import '../panel/format.js'

const Fmt = globalThis.AMFormat
const procs = Array.from({ length: 400 }, (_, i) => ({ pid: 1000 + i, name: 'p' + i, cpu: i, mem: 400 - i }))

test('the list grows page by page until every process is shown', () => {
  const first = Fmt.visibleProcs(procs, '', 'cpu', {}, 150)
  assert.equal(first.rows.length, 150)
  assert.equal(first.more, 250)
  const all = Fmt.visibleProcs(procs, '', 'cpu', {}, 450)
  assert.equal(all.rows.length, 400)
  assert.equal(all.more, 0)
})

test('rows loaded while the order is frozen stay sorted below the frozen ones', () => {
  const frozen = [1005, 1001, 1003]
  const res = Fmt.visibleProcs(procs, '', 'cpu', {}, 10, frozen)
  assert.deepEqual(res.rows.slice(0, 3).map((p) => p.pid), frozen)
  const rest = res.rows.slice(3).map((p) => p.cpu)
  assert.deepEqual(rest, [...rest].sort((a, b) => b - a))
  assert.equal(rest[0], 399)
})
