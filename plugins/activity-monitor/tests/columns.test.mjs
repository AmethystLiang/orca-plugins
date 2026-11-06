import test from 'node:test'
import assert from 'node:assert/strict'
import '../panel/format.js'
import '../panel/columns.js'

const Cols = globalThis.AMColumns
const NAME_MIN = Cols.BY.name.width
const everything = Cols.LIST.map((c) => c.key)
const orders = [
  Cols.DEFAULT,
  everything,
  ['name', ...Cols.EXTRA],
  ['cpu', 'mem', 'pid', 'name', 'user', 'time'],
  Cols.clean(['user', 'netIn', 'cpu'])
]
const widths = [0, 100, 160, 260, 360, 600, 2000]

const total = (kept) => kept.reduce((sum, k) => sum + Cols.BY[k].width, 0)

test('fitted columns never exceed the width once the name column is counted', () => {
  for (const order of orders) {
    for (const width of widths) {
      const kept = Cols.fit(order, width)
      assert.ok(total(kept) <= Math.max(width, NAME_MIN), `order ${order} width ${width} used ${total(kept)}`)
    }
  }
})

test('the name column is always kept', () => {
  for (const order of orders) {
    for (const width of widths) {
      assert.ok(Cols.fit(order, width).includes('name'), `order ${order} width ${width}`)
    }
  }
})

test('kept columns are an in-order subset of the requested order', () => {
  for (const order of orders) {
    for (const width of widths) {
      const kept = Cols.fit(order, width)
      let at = -1
      for (const k of kept) {
        const next = order.indexOf(k)
        assert.ok(next > at, `${k} out of order for ${order} at ${width}`)
        at = next
      }
    }
  }
})

test('columns that do not fit are dropped from the end of the order', () => {
  const kept = Cols.fit(everything, 260)
  assert.deepEqual(kept, ['pid', 'name', 'cpu', 'mem'])
  assert.equal(total(kept), 50 + NAME_MIN + 54 + 58)
  assert.deepEqual(Cols.fit(Cols.DEFAULT, 160), ['pid', 'name'])
})

test('a column that does not fit hides every later column even if narrower', () => {
  assert.deepEqual(Cols.fit(everything, 310), ['pid', 'name', 'cpu', 'mem'])
})

test('fitted non-name columns are always a prefix of the order non-name columns', () => {
  for (const order of orders) {
    for (let width = 0; width <= 700; width += 7) {
      const kept = Cols.fit(order, width).filter((k) => k !== 'name')
      const wanted = order.filter((k) => k !== 'name')
      assert.deepEqual(kept, wanted.slice(0, kept.length), `order ${order} width ${width}`)
    }
  }
})

test('a wide enough panel keeps every column', () => {
  assert.deepEqual(Cols.fit(everything, 2000), everything)
})
