import { execFile } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import type { Memory, Proc } from './parse.ts'
import type { Battery, Extra, Pair } from './details.ts'

export type Deps = {
  run(command: string, args: string[]): Promise<string | null>
  read(path: string): Promise<string>
  list(path: string): Promise<string[]>
}

export type Raw = {
  memory: Memory
  swap: number | null
  swapTotal?: number | null
  pressure: string | null
  net: { rx: number; tx: number; iface: string | null; name: string | null } | null
  disk: { read: number; write: number; devices: number } | null
  gpu: { utilization: number; model: string } | null
  packets?: Pair | null
  ops?: Pair | null
  battery?: Battery | null
}

export type Details = { rows: Map<number, Extra>; procs: number | null; threads: number | null }

export type Identity = { name: string; start: string | null }
export type QuitResult = { ok: boolean; reason?: string }

export type Provider = {
  diskPath: string
  diskName: string
  countIrq: boolean
  procEvery: number
  protectedNames: RegExp
  info(): Promise<{ performance: number[]; efficiency: number[]; model: string }>
  note(): Promise<string | null>
  read(): Promise<Raw>
  procs(): Promise<Proc[] | null>
  detailsEvery: number
  details(energy: boolean): Promise<Details | null>
  identify(pid: number): Promise<Identity | null>
  quit(pid: number, force: boolean): Promise<QuitResult>
}

const ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' }

export const nodeDeps: Deps = {
  run(command, args) {
    return new Promise((resolve) => {
      execFile(command, args, { timeout: 8000, maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: ENV }, (error, out) => resolve(error ? null : String(out)))
    })
  },
  read(path) {
    return readFile(path, 'utf8').catch(() => '')
  },
  list(path) {
    return readdir(path).catch(() => [] as string[])
  }
}

export function osMemory(): Memory {
  const total = os.totalmem()
  const used = Math.max(0, total - os.freemem())
  return { total, used, app: used, wired: 0, compressed: 0, cached: 0 }
}

export function signalQuit(pid: number, force = false): Promise<QuitResult> {
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM')
    return Promise.resolve({ ok: true })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ESRCH') return Promise.resolve({ ok: false, reason: 'Already gone' })
    return Promise.resolve({ ok: false, reason: code === 'EPERM' ? 'Not allowed: another user owns it' : 'Could not quit it' })
  }
}

export function background<T>(load: () => Promise<T | null>, every: () => number) {
  let value: T | null = null
  let at = 0
  let running: Promise<void> | null = null
  function refresh() {
    if (running || Date.now() - at < every()) return
    running = load()
      .then((v) => {
        if (v !== null) value = v
      }, () => undefined)
      .finally(() => {
        at = Date.now()
        running = null
      })
  }
  return {
    peek(): T | null {
      refresh()
      return value
    },
    async ready(): Promise<T | null> {
      refresh()
      if (value === null && running) await running
      return value
    }
  }
}
