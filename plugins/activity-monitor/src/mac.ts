import os from 'node:os'
import { background, osMemory, signalQuit, type Deps, type Provider } from './deps.ts'
import { parseAssertions, parseDiskOps, parseGpuClients, parseNetstatPackets, parseNettop, parsePmsetBatt, parseTop, type Extra } from './details.ts'
import {
  memoryFrom,
  parseDiskBytes,
  parseGpu,
  parseNetstat,
  parsePorts,
  parseLsofCwd,
  parsePs,
  parsePsArgs,
  parseSwap,
  parseVmStat,
  pressureName,
  range
} from './parse.ts'

const PS_FIELDS = 'pid=,ppid=,pcpu=,rss=,user=,time=,lstart=,comm='
const TOP_STATS = 'pid,threads,ports,idlew,power'

const LSOF_AT_ONCE = 8

export function createMac(d: Deps): Provider {
  const route = background(async () => {
    const [text, ports] = await Promise.all([d.run('route', ['-n', 'get', 'default']), d.run('networksetup', ['-listallhardwareports'])])
    const iface = /interface:\s*(\S+)/.exec(text ?? '')?.[1] ?? null
    return { iface, name: iface ? parsePorts(ports ?? '')[iface] ?? iface : null }
  }, () => 15000)
  const battery = background(async () => parsePmsetBatt((await d.run('pmset', ['-g', 'batt'])) ?? ''), () => 15000)
  const sockets = background(async () => {
    const out = await d.run('nettop', ['-P', '-L', '1', '-x', '-J', 'bytes_in,bytes_out'])
    return out ? parseNettop(out) : null
  }, () => 10000)
  let gpuBefore = new Map<number, number>()
  let gpuAt = 0

  return {
    diskPath: '/System/Volumes/Data',
    diskName: 'Startup disk',
    countIrq: true,
    procEvery: 0,
    detailsEvery: 4000,
    protectedNames: /^(launchd|kernel_task|WindowServer|loginwindow|logind|opendirectoryd|securityd)$/,
    async info() {
      const [p, e, brand] = await Promise.all([
        d.run('sysctl', ['-n', 'hw.perflevel0.logicalcpu']),
        d.run('sysctl', ['-n', 'hw.perflevel1.logicalcpu']),
        d.run('sysctl', ['-n', 'machdep.cpu.brand_string'])
      ])
      const pc = Number(p) || 0
      const ec = Number(e) || 0
      return { performance: range(ec, pc), efficiency: range(0, ec), model: (brand ?? '').trim() }
    },
    async note() {
      return null
    },
    async read() {
      const link = await route.ready()
      const [vm, swap, pressure, netstat, gpuText, diskText] = await Promise.all([
        d.run('vm_stat', []),
        d.run('sysctl', ['vm.swapusage']),
        d.run('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level']),
        d.run('netstat', ['-ibn']),
        d.run('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator']),
        d.run('ioreg', ['-r', '-c', 'IOBlockStorageDriver', '-w0'])
      ])
      const iface = link?.iface ?? null
      const direct = iface ? parseNetstat(netstat ?? '', iface) : null
      const counters = direct ?? parseNetstat(netstat ?? '', null)
      const gpu = parseGpu(gpuText ?? '')
      return {
        memory: vm ? memoryFrom(parseVmStat(vm), os.totalmem()) : osMemory(),
        swap: swap ? parseSwap(swap).used : null,
        swapTotal: swap ? parseSwap(swap).total : null,
        pressure: pressure && pressure.trim() ? pressureName(Number(pressure) || 1) : null,
        net: counters ? { ...counters, iface: direct ? iface : null, name: direct ? link?.name ?? null : null } : null,
        disk: parseDiskBytes(diskText ?? ''),
        gpu: gpu.utilization === null ? null : { utilization: gpu.utilization, model: gpu.model ?? '' },
        packets: parseNetstatPackets(netstat ?? '', direct ? iface : null),
        ops: parseDiskOps(diskText ?? ''),
        battery: battery.peek()
      }
    },
    async procs() {
      const out = await d.run('ps', ['-Aceo', PS_FIELDS])
      const list = out ? parsePs(out) : []
      return list.length ? list : null
    },
    async details(energy) {
      const topArgs = energy ? ['-l', '2', '-s', '1', '-stats', TOP_STATS] : ['-l', '1', '-s', '0', '-stats', TOP_STATS]
      const [topText, gpuText, assertions] = await Promise.all([
        d.run('top', topArgs),
        d.run('ioreg', ['-r', '-c', 'IOAccelerator', '-l', '-d', '3']),
        d.run('pmset', ['-g', 'assertions'])
      ])
      if (!topText) return null
      const top = parseTop(topText)
      const now = Date.now()
      const gpuNow = parseGpuClients(gpuText ?? '')
      const seconds = gpuAt ? (now - gpuAt) / 1000 : 0
      const net = sockets.peek()
      const awake = parseAssertions(assertions ?? '')
      const rows = new Map<number, Extra>()
      const pids = new Set([...top.rows.keys(), ...gpuNow.keys()])
      for (const pid of pids) {
        const row: Extra = { ...(top.rows.get(pid) ?? {}) }
        if (!energy) row.power = null
        const ns = gpuNow.get(pid)
        if (ns !== undefined) {
          row.gpuTime = ns / 1e9
          const before = gpuBefore.get(pid)
          row.gpu = seconds > 0 && before !== undefined ? Math.max(0, Math.min(100, ((ns - before) / 1e9 / seconds) * 100)) : null
        }
        const io = net?.get(pid)
        if (io) { row.netIn = io.in; row.netOut = io.out }
        row.sleep = awake.has(pid)
        rows.set(pid, row)
      }
      if (net) for (const [pid, io] of net) if (!rows.has(pid)) rows.set(pid, { netIn: io.in, netOut: io.out, sleep: awake.has(pid) })
      for (const pid of awake) if (!rows.has(pid)) rows.set(pid, { sleep: true })
      gpuBefore = gpuNow
      gpuAt = now
      return { rows, procs: top.procs, threads: top.threads }
    },
    async identify(pid) {
      const row = parsePs((await d.run('ps', ['-p', String(pid), '-co', PS_FIELDS])) ?? '').find((r) => r.pid === pid)
      return row ? { name: row.name, start: row.start } : null
    },
    async cwds(pids) {
      const out = new Map<number, string | null>()
      if (!pids.length) return out
      const lookup = async (list: number[]) => {
        const text = await d.run('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', list.join(',')], { anyExit: true })
        return text === null ? null : parseLsofCwd(text)
      }
      let found = await lookup(pids)
      if (!found) {
        const merged = new Map<number, string>()
        for (let i = 0; i < pids.length; i += LSOF_AT_ONCE) {
          const each = await Promise.all(pids.slice(i, i + LSOF_AT_ONCE).map((pid) => lookup([pid])))
          for (const part of each) if (part) for (const [pid, path] of part) merged.set(pid, path)
        }
        found = merged
      }
      for (const pid of pids) out.set(pid, found.get(pid) ?? null)
      return out
    },
    async args(pids) {
      if (!pids.length) return new Map()
      return parsePsArgs((await d.run('ps', ['-o', 'pid=,args=', '-p', pids.join(',')])) ?? '')
    },
    quit: signalQuit
  }
}
