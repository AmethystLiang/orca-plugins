import path from 'node:path'
import { cpuPercents, parseWindowsNetstat, parseWindowsProcs, type Proc } from './parse.ts'
import { background, osMemory, type Deps, type Provider } from './deps.ts'
import { parseCimProcs, parseWindowsBattery, parseWindowsPackets } from './details.ts'

const SELECT = "Select-Object Id,ProcessName,CPU,WorkingSet64,@{n='Start';e={if ($_.StartTime) { $_.StartTime.Ticks }}},@{n='Threads';e={$_.Threads.Count}} | ConvertTo-Csv -NoTypeInformation"
const CIM = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ThreadCount,ReadTransferCount,WriteTransferCount | ConvertTo-Csv -NoTypeInformation'
const BATTERY = 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining,BatteryStatus | ConvertTo-Csv -NoTypeInformation'

export function powershellPath(env: Record<string, string | undefined>): string {
  return env.SystemRoot ? path.win32.join(env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe'
}

export function createWindows(d: Deps, env: Record<string, string | undefined> = process.env): Provider {
  const drive = env.SystemDrive || 'C:'
  const shell = powershellPath(env)
  let previous = new Map<number, number | null>()
  let previousAt = 0

  function powershell(script: string) {
    return d.run(shell, ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='SilentlyContinue'; " + script])
  }
  const battery = background(async () => parseWindowsBattery((await powershell(BATTERY)) ?? ''), () => 30000)

  return {
    diskPath: drive + '\\',
    diskName: 'Drive ' + drive,
    countIrq: false,
    procEvery: 3000,
    detailsEvery: 6000,
    protectedNames: /^(System|Idle|Registry|smss|csrss|wininit|winlogon|services|lsass|svchost|dwm|fontdrvhost|MsMpEng|MemCompression|Secure System)$/i,
    async info() {
      return { performance: [], efficiency: [], model: '' }
    },
    async note() {
      return null
    },
    async read() {
      const netstat = (await d.run('netstat', ['-e'])) ?? ''
      const counters = parseWindowsNetstat(netstat)
      return {
        memory: osMemory(),
        swap: null,
        pressure: null,
        net: counters ? { ...counters, iface: null, name: null } : null,
        disk: null,
        gpu: null,
        packets: parseWindowsPackets(netstat),
        ops: null,
        battery: battery.peek()
      }
    },
    async procs() {
      const out = await powershell('Get-Process | ' + SELECT)
      const rows = out ? parseWindowsProcs(out) : []
      if (!rows.length) return null
      const now = Date.now()
      const seconds = new Map(rows.map((r) => [r.pid, r.seconds] as [number, number | null]))
      const pct = cpuPercents(previous, seconds, previousAt ? (now - previousAt) / 1000 : 0)
      previous = seconds
      previousAt = now
      return rows.map((r): Proc => ({ pid: r.pid, name: r.name, mem: r.mem, start: r.start, cpu: pct.get(r.pid) ?? null, time: r.seconds, threads: r.threads }))
    },
    async details() {
      const out = await powershell(CIM)
      if (!out) return null
      const rows = parseCimProcs(out)
      return rows.size ? { rows, procs: null, threads: null } : null
    },
    async identify(pid) {
      const row = parseWindowsProcs((await powershell('Get-Process -Id ' + Number(pid) + ' | ' + SELECT)) ?? '').find((r) => r.pid === pid)
      return row ? { name: row.name, start: row.start } : null
    },
    async quit(pid, force) {
      const out = await d.run('taskkill', force ? ['/F', '/PID', String(pid)] : ['/PID', String(pid)])
      if (out !== null) return { ok: true }
      return { ok: false, reason: force ? 'Could not force quit it' : 'It did not accept a normal quit' }
    }
  }
}
