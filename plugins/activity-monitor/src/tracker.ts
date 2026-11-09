import { type Proc } from './parse.ts'

type Sample = { t: number; cpu: number | null; mem: number }

const KEEP = 12 * 60_000
const CPU_WINDOW = 5 * 60_000
const CPU_SPAN = 4 * 60_000
const MEM_WINDOW = 10 * 60_000
const MEM_SPAN = 9 * 60_000
const CAP_EACH = 100

const keyOf = (pid: number, start: string | null) => pid + '|' + (start ?? '')

function capped(list: Proc[]): Proc[] {
  const byCpu = [...list].sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0)).slice(0, CAP_EACH)
  const byMem = [...list].sort((a, b) => b.mem - a.mem).slice(0, CAP_EACH)
  return [...new Set([...byCpu, ...byMem])]
}

export function createTracker(clock: () => number = Date.now) {
  const series = new Map<string, Sample[]>()

  function add(list: Proc[]): void {
    const t = clock()
    const seen = new Set<string>()
    for (const p of capped(list)) {
      const key = keyOf(p.pid, p.start)
      seen.add(key)
      const samples = series.get(key) ?? []
      samples.push({ t, cpu: p.cpu, mem: p.mem })
      while (samples.length && samples[0].t < t - KEEP) samples.shift()
      series.set(key, samples)
    }
    for (const key of series.keys()) if (!seen.has(key)) series.delete(key)
  }

  function stats(pid: number, start: string | null) {
    const samples = series.get(keyOf(pid, start)) ?? []
    const now = clock()
    let cpuAvg5m: number | null = null
    let memGrowth10m: { bytes: number; ratio: number } | null = null
    const cpuWindow = samples.filter((s) => s.t >= now - CPU_WINDOW)
    const cpus = cpuWindow.map((s) => s.cpu).filter((c): c is number => c !== null)
    if (cpuWindow.length && cpuWindow[0].t <= now - CPU_SPAN && cpus.length) {
      cpuAvg5m = cpus.reduce((a, b) => a + b, 0) / cpus.length
    }
    const memWindow = samples.filter((s) => s.t >= now - MEM_WINDOW)
    if (memWindow.length >= 2 && memWindow[0].t <= now - MEM_SPAN && memWindow[0].mem > 0) {
      const first = memWindow[0].mem
      const bytes = memWindow[memWindow.length - 1].mem - first
      memGrowth10m = { bytes, ratio: bytes / first }
    }
    return { cpuAvg5m, memGrowth10m }
  }

  return { add, stats, size: () => series.size }
}

export type Tracker = ReturnType<typeof createTracker>
