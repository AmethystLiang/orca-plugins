import { parseCsvLine } from './parse.ts'

export type Extra = {
  user?: string | null
  time?: number | null
  threads?: number | null
  ports?: number | null
  idlew?: number | null
  power?: number | null
  gpu?: number | null
  gpuTime?: number | null
  diskRead?: number | null
  diskWrite?: number | null
  netIn?: number | null
  netOut?: number | null
  sleep?: boolean
}

export type Battery = { percent: number; state: string; source: string | null; remaining: string | null }
export type Pair = { in: number; out: number }

export function parseCpuTime(text: string): number | null {
  const m = /^\s*(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:[.,]\d+)?)\s*$/.exec(text)
  if (!m) return null
  const days = Number(m[1] ?? 0)
  const hours = Number(m[2] ?? 0)
  return days * 86400 + hours * 3600 + Number(m[3]) * 60 + Number(m[4].replace(',', '.'))
}

export function parseTop(text: string): { procs: number | null; threads: number | null; rows: Map<number, Extra> } {
  const samples = text.split(/^Processes:/m)
  const last = samples.length > 1 ? 'Processes:' + samples[samples.length - 1] : text
  const head = /^Processes:\s*(\d+) total.*?(\d+) threads/m.exec(last)
  const rows = new Map<number, Extra>()
  let inTable = false
  for (const line of last.split('\n')) {
    if (/^\s*PID\s/.test(line)) { inTable = true; continue }
    if (!inTable) continue
    const f = line.trim().split(/\s+/)
    if (f.length < 5 || !/^\d+$/.test(f[0])) continue
    const num = (s: string) => {
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : null
    }
    rows.set(Number(f[0]), { threads: num(f[1]), ports: num(f[2]), idlew: num(f[3]), power: num(f[4]) })
  }
  return { procs: head ? Number(head[1]) : null, threads: head ? Number(head[2]) : null, rows }
}

export function parseNettop(text: string): Map<number, Pair> {
  const out = new Map<number, Pair>()
  for (const line of text.split('\n')) {
    const m = /^(.*)\.(\d+)[,\s]+(\d+)[,\s]+(\d+)[,\s]*$/.exec(line.trim())
    if (!m) continue
    const pid = Number(m[2])
    const prev = out.get(pid)
    out.set(pid, { in: Number(m[3]) + (prev?.in ?? 0), out: Number(m[4]) + (prev?.out ?? 0) })
  }
  return out
}

export function parseGpuClients(text: string): Map<number, number> {
  const out = new Map<number, number>()
  let pid: number | null = null
  let ns = 0
  const flush = () => {
    if (pid !== null) out.set(pid, (out.get(pid) ?? 0) + ns)
    pid = null
    ns = 0
  }
  for (const line of text.split('\n')) {
    if (line.includes('+-o ')) { flush(); continue }
    const creator = /"IOUserClientCreator"\s*=\s*"pid (\d+),/.exec(line)
    if (creator) pid = Number(creator[1])
    if (line.includes('"AppUsage"')) for (const m of line.matchAll(/"accumulatedGPUTime"=(\d+)/g)) ns += Number(m[1])
  }
  flush()
  return out
}

export function parsePmsetBatt(text: string): Battery | null {
  const m = /(\d+)%;\s*([^;]+?)\s*;\s*([^\n]*?)\s*(?:present:|$)/m.exec(text)
  if (!m) return null
  const source = /drawing from '([^']+)'/.exec(text)?.[1] ?? null
  const time = /(\d+:\d+) remaining/.exec(m[3])?.[1] ?? null
  return { percent: Number(m[1]), state: m[2].trim(), source, remaining: time }
}

export function parseAssertions(text: string): Set<number> {
  const out = new Set<number>()
  for (const m of text.matchAll(/pid (\d+)\([^)]*\):.*?(PreventUserIdleSystemSleep|PreventSystemSleep|PreventUserIdleDisplaySleep|NoIdleSleepAssertion|NoDisplaySleepAssertion)/g)) {
    out.add(Number(m[1]))
  }
  return out
}

export function parseDiskOps(text: string): Pair | null {
  let read = 0
  let write = 0
  let found = false
  for (const m of text.matchAll(/"Operations \((Read|Write)\)"=(\d+)/g)) {
    found = true
    if (m[1] === 'Read') read += Number(m[2])
    else write += Number(m[2])
  }
  return found ? { in: read, out: write } : null
}

export function parseNetstatPackets(text: string, iface: string | null): Pair | null {
  let pin = 0
  let pout = 0
  let found = false
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 10 || !parts[2].startsWith('<Link#')) continue
    const name = parts[0]
    if (iface ? name !== iface : name.startsWith('lo') || name.startsWith('utun')) continue
    pin += Number(parts[parts.length - 7])
    pout += Number(parts[parts.length - 4])
    found = true
  }
  return found ? { in: pin, out: pout } : null
}

export function parseProcNetDevPackets(text: string, iface: string | null): Pair | null {
  let pin = 0
  let pout = 0
  let found = false
  for (const line of text.split('\n')) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line)
    if (!m) continue
    const name = m[1]
    if (iface ? name !== iface : name === 'lo' || /^(docker|veth|br-|virbr|tun|tap|wg|podman|tailscale|cni|flannel|cali|vnet|zt|lxcbr|lxdbr|vmnet|vboxnet)/.test(name)) continue
    const f = m[2].trim().split(/\s+/).map(Number)
    if (f.length < 10) continue
    pin += f[1]
    pout += f[9]
    found = true
  }
  return found ? { in: pin, out: pout } : null
}

export function parseDiskstatsOps(text: string): Pair | null {
  let read = 0
  let write = 0
  let found = false
  for (const line of text.split('\n')) {
    const f = line.trim().split(/\s+/)
    if (f.length < 10) continue
    if (!/^(sd[a-z]+|hd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(f[2])) continue
    read += Number(f[3])
    write += Number(f[7])
    found = true
  }
  return found ? { in: read, out: write } : null
}

export function parseProcIo(text: string): { read: number; write: number } | null {
  const r = /^read_bytes:\s*(\d+)/m.exec(text)
  const w = /^write_bytes:\s*(\d+)/m.exec(text)
  return r && w ? { read: Number(r[1]), write: Number(w[1]) } : null
}

export function parseStatusUid(text: string): number | null {
  const m = /^Uid:\s*(\d+)/m.exec(text)
  return m ? Number(m[1]) : null
}

export function parsePasswd(text: string): Map<number, string> {
  const out = new Map<number, string>()
  for (const line of text.split('\n')) {
    const f = line.split(':')
    if (f.length >= 3 && /^\d+$/.test(f[2])) out.set(Number(f[2]), f[0])
  }
  return out
}

export function linuxBattery(capacity: string, status: string, online: string): Battery | null {
  const percent = Number(capacity.trim())
  if (!capacity.trim() || !Number.isFinite(percent)) return null
  const source = online.trim() === '' ? null : online.trim() === '1' ? 'AC Power' : 'Battery Power'
  return { percent, state: status.trim().toLowerCase() || 'unknown', source, remaining: null }
}

export function parseWindowsPackets(text: string): Pair | null {
  for (const line of text.split('\n')) {
    const m = /^\s*Unicast packets\s+(\d+)\s+(\d+)\s*$/i.exec(line)
    if (m) return { in: Number(m[1]), out: Number(m[2]) }
  }
  return null
}

function csvRows(csv: string): { head: string[]; rows: string[][] } {
  const lines = csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return { head: [], rows: [] }
  return { head: parseCsvLine(lines[0]), rows: lines.slice(1).map(parseCsvLine) }
}

export function parseCimProcs(csv: string): Map<number, Extra> {
  const { head, rows } = csvRows(csv)
  const col = (k: string) => head.indexOf(k)
  const iId = col('ProcessId')
  const out = new Map<number, Extra>()
  if (iId < 0) return out
  const num = (r: string[], i: number) => (i >= 0 && String(r[i] ?? '').trim() !== '' ? Number(r[i]) : null)
  for (const r of rows) {
    const pid = Number(r[iId])
    if (!Number.isInteger(pid)) continue
    out.set(pid, { diskRead: num(r, col('ReadTransferCount')), diskWrite: num(r, col('WriteTransferCount')), threads: num(r, col('ThreadCount')) })
  }
  return out
}

const WIN_BATTERY: Record<string, string> = { '1': 'discharging', '2': 'on AC', '3': 'charged', '4': 'low', '5': 'critical', '6': 'charging', '7': 'charging', '8': 'charging', '9': 'charging', '11': 'partially charged' }

export function parseWindowsBattery(csv: string): Battery | null {
  const { head, rows } = csvRows(csv)
  const iPct = head.indexOf('EstimatedChargeRemaining')
  const iStatus = head.indexOf('BatteryStatus')
  const r = rows[0]
  if (!r || iPct < 0 || String(r[iPct] ?? '').trim() === '') return null
  const status = String(r[iStatus] ?? '')
  return { percent: Number(r[iPct]), state: WIN_BATTERY[status] ?? 'unknown', source: status === '1' ? 'Battery Power' : 'AC Power', remaining: null }
}
