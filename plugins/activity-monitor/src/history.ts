import type { Point } from './sampler.ts'

type Sum = { seq: number; count: number; at: number; total: number; cores: number[]; coreCounts: number[]; mem: number; down: number; up: number; read: number; write: number; gpu: number }
type Bucket = { key: number; sum: Sum }

const SECOND = 1000
export const RAW_MS = 15 * 60 * SECOND
const MID_MS = 6 * 60 * 60 * SECOND
const OLD_MS = 24 * 60 * 60 * SECOND
const MID_WIDTH = 10 * SECOND
const OLD_WIDTH = 60 * SECOND

function empty(): Sum {
  return { seq: 0, count: 0, at: 0, total: 0, cores: [], coreCounts: [], mem: 0, down: 0, up: 0, read: 0, write: 0, gpu: 0 }
}

function addPoint(into: Sum, p: Point): void {
  into.seq = Math.max(into.seq, p.seq)
  into.count += 1
  into.at += p.at
  into.total += p.total
  into.mem += p.mem
  into.down += p.down
  into.up += p.up
  into.read += p.read
  into.write += p.write
  into.gpu += p.gpu
  p.cores.forEach((v, i) => {
    into.cores[i] = (into.cores[i] ?? 0) + v
    into.coreCounts[i] = (into.coreCounts[i] ?? 0) + 1
  })
}

function addSum(into: Sum, from: Sum): void {
  into.seq = Math.max(into.seq, from.seq)
  into.count += from.count
  into.at += from.at
  into.total += from.total
  into.mem += from.mem
  into.down += from.down
  into.up += from.up
  into.read += from.read
  into.write += from.write
  into.gpu += from.gpu
  from.cores.forEach((v, i) => {
    into.cores[i] = (into.cores[i] ?? 0) + v
    into.coreCounts[i] = (into.coreCounts[i] ?? 0) + from.coreCounts[i]
  })
}

function mean(s: Sum): Point {
  const n = s.count
  return {
    seq: s.seq,
    at: s.at / n,
    total: s.total / n,
    cores: s.cores.map((v, i) => v / s.coreCounts[i]),
    mem: s.mem / n,
    down: s.down / n,
    up: s.up / n,
    read: s.read / n,
    write: s.write / n,
    gpu: s.gpu / n
  }
}

function fold(list: Bucket[], key: number, add: (sum: Sum) => void): void {
  const last = list[list.length - 1]
  if (last && last.key === key) {
    add(last.sum)
    return
  }
  const sum = empty()
  add(sum)
  list.push({ key, sum })
}

export function createHistory(clock: () => number = Date.now) {
  const raw: Point[] = []
  const mid: Bucket[] = []
  const old: Bucket[] = []

  function prune(): void {
    const now = clock()
    let r = 0
    while (r < raw.length && raw[r].at <= now - RAW_MS) {
      const p = raw[r]
      fold(mid, Math.floor(p.at / MID_WIDTH) * MID_WIDTH, (sum) => addPoint(sum, p))
      r += 1
    }
    if (r) raw.splice(0, r)
    let m = 0
    while (m < mid.length && mid[m].key + MID_WIDTH <= now - MID_MS) {
      const b = mid[m]
      fold(old, Math.floor(b.key / OLD_WIDTH) * OLD_WIDTH, (sum) => addSum(sum, b.sum))
      m += 1
    }
    if (m) mid.splice(0, m)
    let o = 0
    while (o < old.length && old[o].key + OLD_WIDTH <= now - OLD_MS) o += 1
    if (o) old.splice(0, o)
  }

  function push(p: Point): void {
    raw.push(p)
    prune()
  }

  function since(seq: number): Point[] {
    prune()
    let i = raw.length
    while (i > 0 && raw[i - 1].seq > seq) i -= 1
    return raw.slice(i)
  }

  function window(spanSec: number, maxPoints: number): Point[] {
    prune()
    const now = clock()
    const spanMs = Math.max(1, spanSec) * SECOND
    const bins = Math.max(1, Math.floor(maxPoints))
    const start = now - spanMs
    const width = spanMs / bins
    const sums: (Sum | undefined)[] = []
    function place(at: number, add: (sum: Sum) => void): void {
      if (at < start) return
      const i = Math.min(bins - 1, Math.floor((at - start) / width))
      if (!sums[i]) sums[i] = empty()
      add(sums[i] as Sum)
    }
    for (const b of old) place(b.sum.at / b.sum.count, (sum) => addSum(sum, b.sum))
    for (const b of mid) place(b.sum.at / b.sum.count, (sum) => addSum(sum, b.sum))
    for (const p of raw) place(p.at, (sum) => addPoint(sum, p))
    const out: Point[] = []
    for (const s of sums) if (s) out.push(mean(s))
    return out
  }

  function size(): number {
    return raw.length + mid.length + old.length
  }

  return { push, since, window, size }
}

export type History = ReturnType<typeof createHistory>
