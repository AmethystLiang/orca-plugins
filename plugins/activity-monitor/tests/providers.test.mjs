import test from 'node:test'
import assert from 'node:assert/strict'
import { createLinux } from '../src/linux.ts'
import { createWindows, powershellPath } from '../src/windows.ts'
import { createMac } from '../src/mac.ts'
import { createSampler } from '../src/sampler.ts'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function fakeDeps(files, commands, links = {}) {
  const calls = []
  return {
    calls,
    run: async (command, args) => {
      calls.push([command, ...args].join(' '))
      const out = commands[command]
      if (out === undefined) return null
      return typeof out === 'function' ? out(args) : out
    },
    readlink: async (path) => (typeof links[path] === 'string' ? links[path] : null),
    read: async (path) => (typeof files[path] === 'function' ? files[path]() : files[path] ?? ''),
    list: async (path) => {
      const prefix = path.endsWith('/') ? path : path + '/'
      const names = new Set()
      for (const key of Object.keys(files)) if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0])
      return [...names]
    }
  }
}

const MEMINFO = `MemTotal:       16303428 kB
MemFree:         1203840 kB
MemAvailable:    9876544 kB
Buffers:          204800 kB
Cached:          6291456 kB
SwapCached:            0 kB
Shmem:            409600 kB
SReclaimable:     512000 kB
SwapTotal:       2097148 kB
SwapFree:        1048574 kB
`
const NETDEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 5000000   40000    0    0    0     0          0         0  5000000   40000    0    0    0     0       0          0
wlp2s0: 900000000  700000    0    0    0     0          0         0 120000000  300000    0    0    0     0       0          0
docker0: 777   7    0    0    0     0          0         0  888   8    0    0    0     0       0          0
tailscale0: 555   5    0    0    0     0          0         0  666   6    0    0    0     0       0          0
`
const ROUTE = `Iface	Destination	Gateway 	Flags	RefCnt	Use	Metric	Mask		MTU	Window	IRTT
tun0	00000000	0100080A	0003	0	0	0	00000080	0	0	0
eth0	00000000	0101A8C0	0003	0	0	700	00000000	0	0	0
wlp2s0	00000000	0101A8C0	0003	0	0	600	00000000	0	0	0
wlp2s0	0001A8C0	00000000	0001	0	0	600	00FFFFFF	0	0	0
`
const DISKSTATS = `   7       0 loop0 100 0 2000 10 0 0 0 0 0 10 10
 259       0 nvme0n1 50000 100 4000000 9000 60000 200 8000000 12000 0 20000 21000
 259       1 nvme0n1p1 100 0 2000 10 10 0 20 1 0 10 10
   8       0 sda 1000 0 20000 100 500 0 10000 50 0 100 150
 253       0 dm-0 999 0 99999 1 1 0 99999 1 0 1 1
`
const STAT_1 = '1 (systemd) S 0 1 1 0 -1 4194560 1 1 0 0 300 200 0 0 20 0 1 0 5 170000000 3000 18446744073709551615'
const STAT_42 = '42 (Web Content (x)) R 1 42 42 0 -1 4194560 1 1 0 0 1000 500 0 0 20 0 1 0 777 170000000 25600 18446744073709551615'
const STAT_KTHREAD = '77 (kworker/0:1-events) I 2 0 0 0 -1 69238880 0 0 0 0 0 50 0 0 20 0 1 0 9 0 0 18446744073709551615'
const GETCONF = { getconf: (args) => (args[0] === 'CLK_TCK' ? '100\n' : '4096\n') }

function linuxFiles(extra = {}) {
  return {
    '/proc/meminfo': MEMINFO,
    '/proc/pressure/memory': 'some avg10=12.50 avg60=3.00 avg300=1.00 total=1\nfull avg10=0.00 avg60=0.00 avg300=0.00 total=0\n',
    '/proc/net/route': ROUTE,
    '/proc/net/dev': NETDEV,
    '/proc/diskstats': DISKSTATS,
    '/proc/cpuinfo': 'processor\t: 0\nmodel name\t: 12th Gen Intel(R) Core(TM) i7-1260P\n',
    '/sys/devices/cpu_core/cpus': '0-7\n',
    '/sys/devices/cpu_atom/cpus': '8-15\n',
    '/sys/class/net/wlp2s0/wireless/link': '1',
    '/proc/1/stat': STAT_1,
    '/proc/42/stat': STAT_42,
    '/proc/77/stat': STAT_KTHREAD,
    ...extra
  }
}

test('Linux reads memory, pressure, the lowest-metric default link, whole disks and hybrid cores', async () => {
  const linux = createLinux(fakeDeps(linuxFiles(), GETCONF), '', '/home/me')
  const info = await linux.info()
  assert.equal(info.model, '12th Gen Intel(R) Core(TM) i7-1260P')
  assert.deepEqual(info.performance, [0, 1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(info.efficiency, [8, 9, 10, 11, 12, 13, 14, 15])
  assert.equal(linux.diskPath, '/home/me')
  const raw = await linux.read()
  assert.deepEqual(raw.memory, { total: 16694710272, used: 6581129216, app: 6581129216, wired: 0, compressed: 0, cached: 6757023744 })
  assert.equal(raw.swap, 1073739776)
  assert.equal(raw.pressure, 'warning')
  assert.deepEqual(raw.net, { rx: 900000000, tx: 120000000, iface: 'wlp2s0', name: 'Wi-Fi' })
  assert.deepEqual(raw.disk, { read: 2058240000, write: 4101120000, devices: 2 })
})

test('Linux with no swap reports none instead of zero', async () => {
  const meminfo = MEMINFO.replace('SwapTotal:       2097148', 'SwapTotal:             0').replace('SwapFree:        1048574', 'SwapFree:              0')
  const raw = await createLinux(fakeDeps(linuxFiles({ '/proc/meminfo': meminfo }), GETCONF)).read()
  assert.equal(raw.swap, null)
})

test('Linux processes skip kernel threads and measure CPU between two reads', async () => {
  let stat42 = STAT_42
  const linux = createLinux(fakeDeps(linuxFiles({ '/proc/42/stat': () => stat42 }), GETCONF))
  const first = await linux.procs()
  assert.deepEqual(first.map((p) => p.pid).sort(), [1, 42])
  assert.deepEqual(first.find((p) => p.pid === 42), { pid: 42, ppid: 1, name: 'Web Content (x)', mem: 104857600, start: '777', cpu: 0, time: 15, threads: 1 })
  stat42 = STAT_42.replace(' 1000 500 ', ' 1100 500 ')
  await sleep(1000)
  const cpu = (await linux.procs()).find((p) => p.pid === 42).cpu
  assert.ok(cpu > 90 && cpu <= 100, 'about 100% after 1 CPU-second in one second, got ' + cpu)
  assert.deepEqual(await linux.identify(42), { name: 'Web Content (x)', start: '777' })
  assert.equal(await linux.identify(7), null)
})

test('Linux GPU comes from nvidia-smi off the sample path', async () => {
  const files = linuxFiles({ '/sys/bus/pci/devices/0000:01:00.0/vendor': '0x10de\n', '/sys/bus/pci/devices/0000:01:00.0/class': '0x030200\n', '/sys/bus/pci/devices/0000:01:00.0/power/runtime_status': 'active\n' })
  const linux = createLinux(fakeDeps(files, { 'nvidia-smi': '35, NVIDIA GeForce RTX 3080\n45, NVIDIA GeForce RTX 3080\n' }))
  assert.equal((await linux.read()).gpu, null)
  await sleep(20)
  assert.deepEqual((await linux.read()).gpu, { utilization: 40, model: 'NVIDIA GeForce RTX 3080' })
})

test('Linux does not wake a sleeping NVIDIA GPU to ask how busy it is', async () => {
  const files = linuxFiles({ '/sys/bus/pci/devices/0000:01:00.0/vendor': '0x10de\n', '/sys/bus/pci/devices/0000:01:00.0/class': '0x030200\n', '/sys/bus/pci/devices/0000:01:00.0/power/runtime_status': 'suspended\n' })
  let queries = 0
  const linux = createLinux(fakeDeps(files, { 'nvidia-smi': () => { queries += 1; return '35, NVIDIA GeForce RTX 3080\n' } }))
  const gpu = await (async () => { await linux.read(); await sleep(20); return (await linux.read()).gpu })()
  assert.equal(queries, 1)
  assert.equal(gpu.model, 'NVIDIA GeForce RTX 3080')
})

test('Linux reads AMD utilization from sysfs', async () => {
  const files = linuxFiles({ '/sys/class/drm/card0/device/gpu_busy_percent': '27\n', '/sys/class/drm/card0-DP-1/status': 'connected' })
  const linux = createLinux(fakeDeps(files, {}))
  await linux.read()
  await sleep(20)
  assert.deepEqual((await linux.read()).gpu, { utilization: 27, model: 'AMD GPU' })
})

test('Linux without a default route sums real interfaces, skipping docker and tailscale', async () => {
  const raw = await createLinux(fakeDeps(linuxFiles({ '/proc/net/route': ROUTE.split('\n')[0] + '\n' }), {})).read()
  assert.deepEqual(raw.net, { rx: 900000000, tx: 120000000, iface: null, name: null })
})

test('Linux in a Flatpak says so', async () => {
  assert.match(await createLinux(fakeDeps(linuxFiles({ '/.flatpak-info': '[Application]\n' }), {})).note(), /Flatpak/)
  assert.equal(await createLinux(fakeDeps(linuxFiles(), {})).note(), null)
})

const NETSTAT_E = `Interface Statistics

                           Received            Sent

Bytes                    3125487956       412558761
Unicast packets             4512365         2561478
Non-unicast packets           12547            8547
Discards                          0               0
Errors                            0               0
Unknown protocols                 0
`
const PS_CSV = `\uFEFF"Id","ProcessName","CPU","WorkingSet64","Start"
"4","System","","155648",""
"1234","chrome","10.25","209715200","638660000000000000"
"5678","Code","1,5","104857600","638660000000000001"
`

test('Windows reads network from netstat -e and processes from PowerShell, with blank CPU kept blank', async () => {
  let csv = PS_CSV
  const env = { SystemDrive: 'D:', SystemRoot: 'C:\\Windows' }
  const shell = powershellPath(env)
  assert.equal(shell, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
  const d = fakeDeps({}, { netstat: NETSTAT_E, [shell]: () => csv })
  const win = createWindows(d, env)
  assert.equal(win.diskPath, 'D:\\')
  assert.equal(win.countIrq, false)
  const raw = await win.read()
  assert.deepEqual(raw.net, { rx: 3125487956, tx: 412558761, iface: null, name: null })
  assert.equal(raw.swap, null)
  assert.equal(raw.disk, null)
  const first = await win.procs()
  assert.deepEqual(first.map((p) => [p.pid, p.name, p.cpu, p.mem, p.start]), [
    [4, 'System', null, 155648, null],
    [1234, 'chrome', 0, 209715200, '638660000000000000'],
    [5678, 'Code', 0, 104857600, '638660000000000001']
  ])
  csv = PS_CSV.replace('"10.25"', '"10.75"')
  await sleep(500)
  const chrome = (await win.procs()).find((p) => p.pid === 1234).cpu
  assert.ok(chrome > 85 && chrome <= 100, 'about 100% for half a CPU-second in half a second, got ' + chrome)
  assert.deepEqual(await win.identify(1234), { name: 'chrome', start: '638660000000000000' })
  assert.ok(d.calls.filter((c) => c.startsWith(shell)).every((c) => c.includes('-NoProfile -NonInteractive')))
})

test('Windows reads start PowerShell only for the battery, at most once every 30s, and a failed PowerShell gives no list', async () => {
  const d = fakeDeps({}, { netstat: NETSTAT_E })
  const win = createWindows(d, {})
  await win.read()
  await sleep(10)
  await win.read()
  await win.read()
  assert.equal(d.calls.filter((c) => c === 'netstat -e').length, 3)
  assert.equal(d.calls.filter((c) => c.includes('Win32_Battery')).length, 1)
  assert.equal(d.calls.filter((c) => c.includes('Get-Process')).length, 0)
  assert.equal(await win.procs(), null)
})

test('Windows quit asks taskkill without force', async () => {
  const d = fakeDeps({}, { taskkill: 'SUCCESS: Sent termination signal to the process with PID 1234.\r\n' })
  assert.deepEqual(await createWindows(d, {}).quit(1234), { ok: true })
  assert.deepEqual(d.calls, ['taskkill /PID 1234'])
  assert.deepEqual(await createWindows(fakeDeps({}, {}), {}).quit(1234), { ok: false, reason: 'It did not accept a normal quit' })
})

test('Windows force quit adds /F', async () => {
  const d = fakeDeps({}, { taskkill: 'SUCCESS\r\n' })
  assert.deepEqual(await createWindows(d, {}).quit(1234, true), { ok: true })
  assert.deepEqual(d.calls, ['taskkill /F /PID 1234'])
  assert.deepEqual(await createWindows(fakeDeps({}, {}), {}).quit(1234, true), { ok: false, reason: 'Could not force quit it' })
})

test('force quit really kills a process that ignores a normal quit', async () => {
  const { spawn } = await import('node:child_process')
  const { signalQuit } = await import('../src/deps.ts')
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' })
  await sleep(300)
  const exited = new Promise((resolve) => child.on('exit', (code, signal) => resolve(signal)))
  assert.deepEqual(await signalQuit(child.pid), { ok: true })
  await sleep(300)
  assert.equal(child.exitCode, null)
  assert.equal(child.signalCode, null)
  assert.deepEqual(await signalQuit(child.pid, true), { ok: true })
  assert.equal(await exited, 'SIGKILL')
})

test('macOS: an empty or failed ps is no list, not zero processes', async () => {
  assert.equal(await createMac(fakeDeps({}, { ps: '' })).procs(), null)
  assert.equal(await createMac(fakeDeps({}, {})).procs(), null)
})

function stubProvider(over = {}) {
  return {
    diskPath: '/',
    diskName: 'Root (/)',
    countIrq: true,
    procEvery: 0,
    protectedNames: /^(launchd|loginwindow)$/,
    info: async () => ({ performance: [], efficiency: [], model: '' }),
    note: async () => null,
    read: async () => ({ memory: { total: 100, used: 25, app: 25, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net: null, disk: null, gpu: null }),
    procs: async () => null,
    identify: async () => null,
    quit: async () => ({ ok: true }),
    detailsEvery: 0,
    details: async () => null,
    ...over
  }
}

test('the sampler turns counters into rates, keeps history, and resends all history to a panel with another boot id', async () => {
  let rx = 1000
  const provider = stubProvider({
    read: async () => ({ memory: { total: 100, used: 25, app: 25, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net: { rx, tx: 0, iface: 'eth0', name: 'Ethernet' }, disk: null, gpu: null })
  })
  let busy = 0
  const cpus = () => [{ user: busy, nice: 0, sys: 0, idle: 1000 + busy, irq: 0 }, { user: 0, nice: 0, sys: 0, idle: 1000, irq: 0 }]
  const sampler = createSampler({ provider, cpus, space: async () => ({ blocks: 100, bsize: 10, bavail: 40, bfree: 45 }), settle: 0 })
  const first = await sampler.read({ since: 0, interval: 500 })
  assert.equal(first.sample.net.down, null)
  assert.deepEqual(first.sample.disk, { read: null, write: null, total: 1000, used: 550, free: 400, name: 'Root (/)', readBytes: null, writeBytes: null, readOps: null, writeOps: null, readOpsRate: null, writeOpsRate: null })
  assert.deepEqual(first.sample.cores.map((c) => c.label), ['C1', 'C2'])
  await sleep(500)
  rx = 6000
  busy = 500
  const second = await sampler.read({ since: 1, interval: 500, boot: first.boot })
  assert.ok(second.sample.net.down > 8000 && second.sample.net.down < 11000, 'about 10 KB/s, got ' + second.sample.net.down)
  assert.deepEqual(second.sample.loads.map(Math.round), [50, 0])
  assert.equal(second.history.length, 1)
  assert.equal(second.history[0].mem, 25)
  const stranger = await sampler.read({ since: 99, interval: 500, boot: 'someone-else' })
  assert.equal(stranger.history.length, 2)
})

test('a network interface change gives no rate for that tick instead of a spike', async () => {
  let net = { rx: 5000000, tx: 0, iface: 'utun4', name: 'utun4' }
  const provider = stubProvider({ read: async () => ({ memory: { total: 1, used: 0, app: 0, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net, disk: null, gpu: null }) })
  const sampler = createSampler({ provider, cpus: () => [], space: async () => null, settle: 0 })
  await sampler.read({ interval: 500 })
  await sleep(400)
  net = { rx: 141000000000, tx: 0, iface: 'en0', name: 'Wi-Fi' }
  const after = await sampler.read({ interval: 500 })
  assert.equal(after.sample.net.down, null)
  assert.equal(after.history.at(-1).down, 0)
})

test('reads closer together than most of an interval reuse the last sample', async () => {
  let reads = 0
  const provider = stubProvider({ read: async () => { reads += 1; return { memory: { total: 1, used: 0, app: 0, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net: null, disk: null, gpu: null } } })
  const sampler = createSampler({ provider, cpus: () => [], space: async () => null, settle: 0 })
  await sampler.read({ interval: 1000 })
  await sampler.read({ interval: 1000, procs: true })
  await sampler.read({ interval: 1000 })
  assert.equal(reads, 1)
})

test('the process list is kept when one refresh fails', async () => {
  let fail = false
  const list = [{ pid: 9, name: 'x', cpu: 1, mem: 1, start: 'a' }]
  const provider = stubProvider({ procs: async () => (fail ? null : list) })
  const sampler = createSampler({ provider, cpus: () => [], space: async () => null, settle: 0 })
  assert.deepEqual((await sampler.read({ procs: true, interval: 500 })).procs, list)
  fail = true
  await sleep(600)
  await sampler.read({ procs: true, interval: 500 })
  await sleep(10)
  assert.deepEqual((await sampler.read({ procs: true, interval: 500 })).procs, list)
})

test('quit refuses system pids, Orca, protected names, and a pid reused by a same-named process', async () => {
  const quits = []
  const provider = stubProvider({
    identify: async (pid) => (pid === 999 ? { name: 'node', start: 'Thu Nov 5 09:02:44 2026' } : null),
    quit: async (pid, force) => { quits.push([pid, force]); return { ok: true } }
  })
  const sampler = createSampler({ provider })
  assert.deepEqual(await sampler.quit(1, 'launchd', null), { ok: false, reason: 'Not allowed' })
  assert.deepEqual(await sampler.quit(process.pid, 'node', null), { ok: false, reason: 'Not allowed' })
  assert.deepEqual(await sampler.quit(999, 'Orca Helper', null), { ok: false, reason: 'Quit Orca from its own menu' })
  assert.deepEqual(await sampler.quit(999, 'loginwindow', null), { ok: false, reason: 'Protected system process' })
  assert.deepEqual(await sampler.quit(999, 'python', null), { ok: false, reason: 'That process changed; try again' })
  assert.deepEqual(await sampler.quit(999, 'node', 'Wed Nov 4 08:00:00 2026'), { ok: false, reason: 'That process changed; try again' })
  assert.deepEqual(await sampler.quit(1000, 'python', null), { ok: false, reason: 'Already gone' })
  assert.deepEqual(quits, [])
  assert.deepEqual(await sampler.quit(999, 'node', 'Thu Nov 5 09:02:44 2026'), { ok: true })
  assert.deepEqual(quits, [[999, false]])
  assert.deepEqual(await sampler.quit(999, 'loginwindow', null, true), { ok: false, reason: 'Protected system process' })
  assert.deepEqual(await sampler.quit(999, 'node', 'Thu Nov 5 09:02:44 2026', true), { ok: true })
  assert.deepEqual(quits, [[999, false], [999, true]])
})

test('a 100ms refresh samples fast but refreshes the process list at most about once a second', async () => {
  let reads = 0
  let lists = 0
  const provider = stubProvider({
    read: async () => { reads += 1; return { memory: { total: 1, used: 0, app: 0, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net: null, disk: null, gpu: null } },
    procs: async () => { lists += 1; return [{ pid: 9, name: 'x', cpu: 1, mem: 1, start: 'a' }] }
  })
  const sampler = createSampler({ provider, cpus: () => [], space: async () => null, settle: 0 })
  const until = Date.now() + 1200
  while (Date.now() < until) { await sampler.read({ procs: true, interval: 100 }); await sleep(100) }
  assert.ok(reads >= 8, 'expected about 10 samples, got ' + reads)
  assert.ok(lists <= 2, 'expected at most 2 process lists, got ' + lists)
})

test('mac cwds read lsof output, mark missing pids null, and skip lsof for no pids', async () => {
  const deps = fakeDeps({}, { lsof: 'p501\nfcwd\nn/Users/x/gone\n' })
  const mac = createMac(deps)
  assert.deepEqual(await mac.cwds([501]), new Map([[501, '/Users/x/gone']]))
  assert.deepEqual(await mac.cwds([501, 502]), new Map([[501, '/Users/x/gone'], [502, null]]))
  assert.ok(deps.calls.some((c) => c === 'lsof -a -d cwd -Fn -p 501'))
  deps.calls.length = 0
  assert.equal((await mac.cwds([])).size, 0)
  assert.deepEqual(deps.calls, [])
})

test('mac cwds fall back to one lookup per pid when lsof fails on a gone pid', async () => {
  const mac = createMac(fakeDeps({}, { lsof: (args) => (args[5] === '501' ? 'p501\nfcwd\nn/a\n' : null) }))
  assert.deepEqual(await mac.cwds([501, 9]), new Map([[501, '/a'], [9, null]]))
})

test('mac cwds keep what a batched lsof printed when it exits non-zero, with no per-pid retries', async () => {
  const seen = []
  const deps = fakeDeps({}, {})
  deps.run = async (command, args, options) => {
    seen.push({ args: args.join(' '), anyExit: options?.anyExit === true })
    return options?.anyExit ? 'p501\nfcwd\nn/a\n' : null
  }
  const mac = createMac(deps)
  assert.deepEqual(await mac.cwds([501, 1, 2]), new Map([[501, '/a'], [1, null], [2, null]]))
  assert.deepEqual(seen, [{ args: '-a -d cwd -Fn -p 501,1,2', anyExit: true }])
})

test('mac cwds run at most 8 single-pid lookups at once when the batch cannot run', async () => {
  let running = 0
  let peak = 0
  const deps = fakeDeps({}, {})
  deps.run = async (command, args) => {
    const list = args[5].split(',')
    if (list.length > 1) return null
    running++
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 2))
    running--
    return 'p' + list[0] + '\nfcwd\nn/d' + list[0] + '\n'
  }
  const mac = createMac(deps)
  const pids = Array.from({ length: 30 }, (_, i) => 100 + i)
  const out = await mac.cwds(pids)
  assert.equal(out.size, 30)
  assert.equal(out.get(129), '/d129')
  assert.ok(peak <= 8, 'peak ' + peak)
})

test('mac args read ps output', async () => {
  const deps = fakeDeps({}, { ps: '  501 node /app/server.js --port 3000\n  502 vite\n' })
  const mac = createMac(deps)
  assert.deepEqual(await mac.args([501, 502]), new Map([[501, 'node /app/server.js --port 3000'], [502, 'vite']]))
  assert.deepEqual(deps.calls, ['ps -o pid=,args= -p 501,502'])
  assert.equal((await mac.args([])).size, 0)
})

test('mac args keep what a batched ps printed when a pid vanished and ps exits non-zero', async () => {
  const seen = []
  const deps = fakeDeps({}, {})
  deps.run = async (command, args, options) => {
    seen.push({ args: args.join(' '), anyExit: options?.anyExit === true })
    return options?.anyExit ? '  501 node /app/server.js\n' : null
  }
  const mac = createMac(deps)
  assert.deepEqual(await mac.args([501, 9]), new Map([[501, 'node /app/server.js']]))
  assert.deepEqual(seen, [{ args: '-o pid=,args= -p 501,9', anyExit: true }])
})

test('Linux cwds read the proc cwd link and args read the NUL separated cmdline', async () => {
  const linux = createLinux(fakeDeps(linuxFiles({ '/proc/42/cmdline': 'node\x00/app/server.js\x00--port\x003000\x00' }), GETCONF, { '/proc/42/cwd': '/home/me/app' }))
  assert.deepEqual(await linux.cwds([42, 1]), new Map([[42, '/home/me/app'], [1, null]]))
  assert.deepEqual(await linux.args([42, 1]), new Map([[42, 'node /app/server.js --port 3000']]))
  assert.equal((await linux.cwds([])).size, 0)
})

test('Windows cwds and args are empty', async () => {
  const win = createWindows(fakeDeps({}, {}), {})
  assert.equal((await win.cwds([4])).size, 0)
  assert.equal((await win.args([4])).size, 0)
})
