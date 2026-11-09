import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseVmStat,
  memoryFrom,
  parseSwap,
  pressureName,
  parseNetstat,
  parsePorts,
  parseGpu,
  parseDiskBytes,
  parsePs,
  parseProcStat,
  coreLoads,
  coreLayout,
  rate
} from '../src/parse.ts'

const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8')

test('vm_stat pages become the same memory split Activity Monitor shows', () => {
  const memory = memoryFrom(parseVmStat(fixture('vm_stat.txt')), 17179869184)
  assert.deepEqual(memory, {
    total: 17179869184,
    app: 3331211264,
    wired: 3707387904,
    compressed: 7432667136,
    cached: 1919041536,
    used: 14471266304
  })
})

test('used memory never exceeds the installed total', () => {
  const pages = { pageSize: 4096, 'Anonymous pages': 1000, 'Pages wired down': 1000, 'Pages occupied by compressor': 1000 }
  assert.equal(memoryFrom(pages, 8192).used, 8192)
})

test('swap usage is read in bytes', () => {
  assert.deepEqual(parseSwap(fixture('swap.txt')), { total: 8589934592, used: 7801206211 })
})

test('memory pressure levels map to words', () => {
  assert.deepEqual([1, 2, 4].map(pressureName), ['normal', 'warning', 'critical'])
})

test('netstat bytes come from the interface link row only', () => {
  assert.deepEqual(parseNetstat(fixture('netstat.txt'), 'en0'), { rx: 130153845750, tx: 4889256010 })
})

test('without a default interface, netstat sums every non-loopback, non-tunnel link', () => {
  assert.deepEqual(parseNetstat(fixture('netstat.txt'), null), { rx: 130153845750, tx: 4889256010 })
})

test('an interface that is not listed gives no counters', () => {
  assert.equal(parseNetstat(fixture('netstat.txt'), 'en9'), null)
})

test('hardware ports name each device', () => {
  assert.deepEqual(parsePorts(fixture('ports.txt')), { en4: 'Ethernet Adapter (en4)', en0: 'Wi-Fi' })
})

test('GPU utilization and model come from the accelerator', () => {
  assert.deepEqual(parseGpu(fixture('ioreg-gpu.txt')), { utilization: 39, model: 'Apple M5' })
  assert.deepEqual(parseGpu(''), { utilization: null, model: null })
})

test('disk bytes add up across every block storage driver', () => {
  assert.deepEqual(parseDiskBytes(fixture('ioreg-disk.txt')), { read: 3777854207488, write: 2885546669568, devices: 2 })
  assert.equal(parseDiskBytes(''), null)
})

test('ps rows keep names with spaces, start times, and turn kilobytes into bytes', () => {
  const list = parsePs(fixture('ps.txt'))
  assert.equal(list.length, 6)
  assert.deepEqual(list[4], { pid: 564, ppid: 1, cpu: 0, mem: 1654784, name: 'Core Audio Driver (MSTeamsAudioDevice.driver)', start: 'Wed Nov 4 11:17:30 2026' })
  assert.deepEqual(list[5], { pid: 960, ppid: 1, cpu: 0.4, mem: 868352, name: 'redis-server 127.0.0.1:6379', start: 'Wed Nov 4 11:20:01 2026' })
})

test('ps rows with a parent pid column keep it, and the old shape has none', () => {
  const [row] = parsePs('  77     1   0.4  18224 Wed Nov  4 11:16:47 2026     launchd\n')
  assert.equal(row.ppid, 1)
  assert.equal(row.pid, 77)
  assert.equal(row.cpu, 0.4)
  assert.equal(row.mem, 18224 * 1024)
  assert.equal(parsePs('  77 0.4 18224 Wed Nov  4 11:16:47 2026     launchd\n')[0].ppid, undefined)
})

test('parseProcStat reads the parent pid from field 4', () => {
  assert.equal(parseProcStat('42 (Web Content (x)) R 1 42 42 0 -1 4194560 1 1 0 0 1000 500 0 0 20 0 1 0 777 170000000 25600 18446744073709551615').ppid, 1)
  assert.equal(parseProcStat('42 (a) S 900 42 42 0 -1 4194560 1 1 0 0 1000 500 0 0 20 0 1 0 777 170000000 25600 18446744073709551615').ppid, 900)
})

test('numbers printed with a decimal comma still parse', () => {
  assert.deepEqual(parsePs('  12  85,5   1024 Thu Nov  5 09:02:44 2026     node\n').map((p) => p.cpu), [85.5])
  assert.deepEqual(parseSwap('vm.swapusage: total = 8192,00M  used = 1024,50M  free = 7167,50M'), { total: 8589934592, used: 1074266112 })
})

test('core load is busy time over all time since the last sample', () => {
  const before = [{ user: 100, nice: 0, sys: 50, idle: 850, irq: 0 }, { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }]
  const after = [{ user: 160, nice: 0, sys: 90, idle: 950, irq: 0 }, { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }]
  assert.deepEqual(coreLoads(before, after), [50, 0])
  assert.deepEqual(coreLoads([], after), [0, 0])
})

test('Apple silicon cores list performance first, though the kernel numbers efficiency first', () => {
  assert.deepEqual(coreLayout(10, [6, 7, 8, 9], [0, 1, 2, 3, 4, 5]).map((c) => c.label + '=' + c.index).join(' '),
    'P1=6 P2=7 P3=8 P4=9 E1=0 E2=1 E3=2 E4=3 E5=4 E6=5')
})

test('without performance levels, cores are numbered plainly', () => {
  assert.deepEqual(coreLayout(4, [], []).map((c) => c.label + '=' + c.index).join(' '), 'C1=0 C2=1 C3=2 C4=3')
})

test('a counter that went backwards gives no rate', () => {
  assert.equal(rate(1000, 3000, 2), 1000)
  assert.equal(rate(3000, 1000, 2), null)
  assert.equal(rate(undefined, 1000, 2), null)
})
