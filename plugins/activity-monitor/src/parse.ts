export type Memory = { total: number; used: number; app: number; wired: number; compressed: number; cached: number }
export type Swap = { total: number; used: number }
export type Counters = { rx: number; tx: number }
import { parseCpuTime, type Extra } from './details.ts'

export type Proc = { pid: number; ppid?: number; cpu: number | null; mem: number; name: string; start: string | null } & Extra
export type CpuTimes = { user: number; nice: number; sys: number; idle: number; irq: number }
export type Core = { index: number; label: string }

export function parseVmStat(text: string): Record<string, number> {
  const pages: Record<string, number> = {}
  const size = /page size of (\d+) bytes/.exec(text)
  pages.pageSize = size ? Number(size[1]) : 4096
  for (const line of text.split('\n')) {
    const match = /^"?([^":]+)"?:\s+(\d+)\.?$/.exec(line.trim())
    if (match) pages[match[1].trim()] = Number(match[2])
  }
  return pages
}

export function memoryFrom(pages: Record<string, number>, total: number): Memory {
  const size = pages.pageSize
  const count = (key: string) => (pages[key] ?? 0) * size
  const app = Math.max(0, count('Anonymous pages') - count('Pages purgeable'))
  const wired = count('Pages wired down')
  const compressed = count('Pages occupied by compressor')
  const cached = count('File-backed pages') + count('Pages purgeable')
  return { total, used: Math.min(total, app + wired + compressed), app, wired, compressed, cached }
}

export function parseSwap(text: string): Swap {
  const mb = (key: string) => {
    const match = new RegExp(key + ' = ([\\d.,]+)M').exec(text)
    return match ? Math.round(Number(match[1].replace(',', '.')) * 1024 * 1024) : 0
  }
  return { total: mb('total'), used: mb('used') }
}

export function pressureName(level: number): string {
  if (level >= 4) return 'critical'
  if (level >= 2) return 'warning'
  return 'normal'
}

export function parseNetstat(text: string, iface: string | null): Counters | null {
  let rx = 0
  let tx = 0
  let found = false
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 10 || !parts[2].startsWith('<Link#')) continue
    const name = parts[0]
    if (iface ? name !== iface : name.startsWith('lo') || name.startsWith('utun')) continue
    rx += Number(parts[parts.length - 5])
    tx += Number(parts[parts.length - 2])
    found = true
  }
  return found ? { rx, tx } : null
}

export function parsePorts(text: string): Record<string, string> {
  const names: Record<string, string> = {}
  let port = ''
  for (const line of text.split('\n')) {
    const p = /^Hardware Port: (.+)$/.exec(line)
    if (p) port = p[1].trim()
    const d = /^Device: (.+)$/.exec(line)
    if (d && port) names[d[1].trim()] = port
  }
  return names
}

export function parseGpu(text: string): { utilization: number | null; model: string | null } {
  const use = /"Device Utilization %"=(\d+)/.exec(text)
  const model = /"model" = "([^"]+)"/.exec(text)
  return { utilization: use ? Number(use[1]) : null, model: model ? model[1] : null }
}

export function parseDiskBytes(text: string): { read: number; write: number; devices: number } | null {
  let read = 0
  let write = 0
  let devices = 0
  for (const match of text.matchAll(/"Bytes \((Read|Write)\)"=(\d+)/g)) {
    if (match[1] === 'Read') {
      read += Number(match[2])
      devices += 1
    } else write += Number(match[2])
  }
  return devices ? { read, write, devices } : null
}

export function parsePs(text: string): Proc[] {
  const list: Proc[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(?:(\d+)\s+)?([\d.,]+)\s+(\d+)\s+(?:(\S+)\s+([\d:.,-]+)\s+)?(\w{3}\s+\w{3}\s+\d+\s+[\d:]+\s+\d{4})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const proc: Proc = { pid: Number(match[1]), cpu: Number(match[3].replace(',', '.')), mem: Number(match[4]) * 1024, name: match[8], start: match[7].replace(/\s+/g, ' ') }
    if (match[2] !== undefined) proc.ppid = Number(match[2])
    if (match[5] !== undefined) {
      proc.user = match[5]
      proc.time = parseCpuTime(match[6])
    }
    list.push(proc)
  }
  return list
}

export function cpuPercents(previous: Map<number, number | null>, current: Map<number, number | null>, seconds: number): Map<number, number | null> {
  const out = new Map<number, number | null>()
  for (const [pid, value] of current) {
    const before = previous.get(pid)
    if (value === null) out.set(pid, null)
    else if (before === undefined || before === null || seconds <= 0 || value < before) out.set(pid, 0)
    else out.set(pid, Math.round(((value - before) / seconds) * 1000) / 10)
  }
  return out
}

export function coreLoads(previous: CpuTimes[], current: CpuTimes[], countIrq = true): number[] {
  const irq = countIrq ? 1 : 0
  return current.map((now, i) => {
    const before = previous[i]
    if (!before) return 0
    const busy = now.user + now.nice + now.sys + irq * now.irq - (before.user + before.nice + before.sys + irq * before.irq)
    const all = busy + now.idle - before.idle
    return all > 0 ? Math.max(0, Math.min(100, (busy / all) * 100)) : 0
  })
}

export function coreLayout(total: number, performance: number[], efficiency: number[]): Core[] {
  const valid = (list: number[]) => list.length > 0 && list.every((i) => i >= 0 && i < total)
  if (!valid(performance) || !valid(efficiency) || performance.length + efficiency.length !== total) {
    return Array.from({ length: total }, (_, i) => ({ index: i, label: 'C' + (i + 1) }))
  }
  const p = performance.map((index, i) => ({ index, label: 'P' + (i + 1) }))
  const e = efficiency.map((index, i) => ({ index, label: 'E' + (i + 1) }))
  return p.concat(e)
}

export function range(from: number, count: number): number[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => from + i)
}

export function parseCpuList(text: string): number[] {
  const out: number[] = []
  for (const part of text.trim().split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!m) continue
    const a = Number(m[1])
    const b = m[2] === undefined ? a : Number(m[2])
    for (let i = a; i <= b; i++) out.push(i)
  }
  return out
}

export function parseMeminfo(text: string): { memory: Memory; swap: number | null; swapTotal: number | null } {
  const kb: Record<string, number> = {}
  for (const line of text.split('\n')) {
    const m = /^(\w+(?:\(\w+\))?):\s+(\d+)/.exec(line)
    if (m) kb[m[1]] = Number(m[2]) * 1024
  }
  const total = kb.MemTotal ?? 0
  const available = kb.MemAvailable ?? (kb.MemFree ?? 0) + (kb.Cached ?? 0) + (kb.Buffers ?? 0)
  const used = Math.max(0, total - available)
  const cached = Math.max(0, (kb.Buffers ?? 0) + (kb.Cached ?? 0) + (kb.SReclaimable ?? 0) - (kb.Shmem ?? 0))
  return {
    memory: { total, used, app: used, wired: 0, compressed: 0, cached: Math.min(cached, Math.max(0, total - used)) },
    swap: kb.SwapTotal ? Math.max(0, kb.SwapTotal - (kb.SwapFree ?? 0)) : null,
    swapTotal: kb.SwapTotal ? kb.SwapTotal : null
  }
}

export function linuxPressure(text: string): string | null {
  const m = /^some\s+avg10=([\d.]+)/m.exec(text)
  if (!m) return null
  const v = Number(m[1])
  if (v >= 40) return 'critical'
  if (v >= 10) return 'warning'
  return 'normal'
}

export function linuxDefaultIface(route: string): string | null {
  let best: string | null = null
  let metric = Infinity
  for (const line of route.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 8 || parts[1] !== '00000000' || parts[7] !== '00000000') continue
    if (!(parseInt(parts[3], 16) & 1)) continue
    const m = Number(parts[6]) || 0
    if (m < metric) {
      metric = m
      best = parts[0]
    }
  }
  return best
}

export function parseProcNetDev(text: string, iface: string | null): Counters | null {
  let rx = 0
  let tx = 0
  let found = false
  for (const line of text.split('\n')) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const name = m[1]
    if (iface ? name !== iface : name === 'lo' || /^(docker|veth|br-|virbr|tun|tap|wg|podman|tailscale|cni|flannel|cali|vnet|zt|lxcbr|lxdbr|vmnet|vboxnet)/.test(name)) continue
    const f = m[2].trim().split(/\s+/).map(Number)
    if (f.length < 9) continue
    rx += f[0]
    tx += f[8]
    found = true
  }
  return found ? { rx, tx } : null
}

export function ifaceKind(iface: string | null): string | null {
  if (!iface) return null
  if (/^(wl|wlan|wifi)/i.test(iface)) return 'Wi-Fi'
  if (/^(en|eth)/i.test(iface)) return 'Ethernet'
  return iface
}

export function parseDiskstats(text: string): { read: number; write: number; devices: number } | null {
  let read = 0
  let write = 0
  let devices = 0
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10) continue
    if (!/^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(f[2])) continue
    read += Number(f[5]) * 512
    write += Number(f[9]) * 512
    devices += 1
  }
  return devices ? { read, write, devices } : null
}

export function parseProcStat(text: string): { name: string; ppid: number; ticks: number; rssPages: number; kernel: boolean; start: string; threads: number } | null {
  const open = text.indexOf('(')
  const close = text.lastIndexOf(')')
  if (open < 0 || close < open) return null
  const rest = text.slice(close + 2).trim().split(/\s+/)
  if (rest.length < 22) return null
  const kernel = (Number(rest[6]) & 0x00200000) !== 0 || rest[1] === '2'
  return { name: text.slice(open + 1, close), ppid: Number(rest[1]), ticks: Number(rest[11]) + Number(rest[12]), rssPages: Number(rest[21]), kernel, start: rest[19], threads: Number(rest[17]) }
}

export function parseLsofCwd(text: string): Map<number, string> {
  const out = new Map<number, string>()
  let pid: number | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1)) || null
    else if (line.startsWith('n') && pid !== null && !out.has(pid)) out.set(pid, line.slice(1))
  }
  return out
}

export function parsePsArgs(text: string): Map<number, string> {
  const out = new Map<number, string>()
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line)
    if (match) out.set(Number(match[1]), match[2])
  }
  return out
}

export function parseNvidiaSmi(text: string): { utilization: number; model: string } | null {
  const rows = text.trim().split('\n').map((line) => line.split(',').map((x) => x.trim())).filter((r) => r.length >= 2 && /^\d+$/.test(r[0]))
  if (!rows.length) return null
  const avg = rows.reduce((a, r) => a + Number(r[0]), 0) / rows.length
  return { utilization: avg, model: rows[0].slice(1).join(', ') }
}

export function parseWindowsNetstat(text: string): Counters | null {
  for (const line of text.split('\n')) {
    const m = /^\s*\S.*?\s(\d{1,20})\s+(\d{1,20})\s*$/.exec(line)
    if (m) return { rx: Number(m[1]), tx: Number(m[2]) }
  }
  return null
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

export function parseWindowsProcs(csv: string): { pid: number; name: string; seconds: number | null; mem: number; start: string | null; threads: number | null }[] {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const head = parseCsvLine(lines[0])
  const col = (k: string) => head.indexOf(k)
  const iId = col('Id')
  const iName = col('ProcessName')
  const iCpu = col('CPU')
  const iMem = col('WorkingSet64')
  const iStart = col('Start')
  const iThreads = col('Threads')
  if (iId < 0 || iName < 0) return []
  return lines.slice(1).map(parseCsvLine).map((r) => ({
    pid: Number(r[iId]),
    name: r[iName],
    seconds: String(r[iCpu] ?? '').trim() === '' ? null : Number(String(r[iCpu]).replace(',', '.')),
    mem: Number(r[iMem]) || 0,
    start: iStart >= 0 && r[iStart] ? r[iStart] : null,
    threads: iThreads >= 0 && String(r[iThreads] ?? '').trim() !== '' ? Number(r[iThreads]) : null
  })).filter((p) => Number.isInteger(p.pid) && p.pid > 0)
}

export function rate(previous: number | undefined, current: number | undefined, seconds: number): number | null {
  if (previous === undefined || current === undefined || seconds <= 0 || current < previous) return null
  return (current - previous) / seconds
}
