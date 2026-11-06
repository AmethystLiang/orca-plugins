import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as D from '../src/details.ts'
import { parsePs, parseProcStat, parseWindowsProcs } from '../src/parse.ts'
import { createSampler } from '../src/sampler.ts'

const fixture = (name) => readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8')

test('CPU time accepts ps formats with and without hours and days', () => {
  assert.equal(D.parseCpuTime('0:00.20'), 0.2)
  assert.equal(D.parseCpuTime('30:37.26'), 1837.26)
  assert.equal(D.parseCpuTime('2:00:01'), 7201)
  assert.equal(D.parseCpuTime('1-00:00:00'), 86400)
  assert.equal(D.parseCpuTime('12,5'), null)
})

test('macOS ps rows carry user and CPU time, and the old format still parses', () => {
  const [row] = parsePs('    1   0.6  15152 root              30:37.26 Wed Nov  4 11:16:47 2026     launchd\n')
  assert.deepEqual(row, { pid: 1, cpu: 0.6, mem: 15152 * 1024, name: 'launchd', start: 'Wed Nov 4 11:16:47 2026', user: 'root', time: 1837.26 })
  const [old] = parsePs('  5 1.0 10 Wed Nov  4 11:16:47 2026 Google Chrome Helper\n')
  assert.equal(old.name, 'Google Chrome Helper')
  assert.equal(old.user, undefined)
})

test('top: the last sample wins, with totals, threads, ports, idle wake-ups and power', () => {
  const top = D.parseTop(fixture('mac-top.txt'))
  assert.equal(top.procs, 1204)
  assert.equal(top.threads, 5294)
  assert.deepEqual(top.rows.get(32361), { threads: 9, ports: 34, idlew: 3942, power: 103.8 })
  assert.deepEqual(top.rows.get(420), { threads: 23, ports: 16759, idlew: 8818567, power: 33.2 })
  assert.equal(top.rows.get(0).threads, 803)
  assert.equal(top.rows.has(99867), false)
})

test('nettop: name.pid rows, names with dots and spaces, repeats summed', () => {
  const text = '                     bytes_in       bytes_out\nlaunchd.1     0   0\nGoogle Chrome H.2215   1200  300\ncom.apple.WebKit.Networking.881  50 60\ncom.apple.WebKit.Networking.881  5 6\n'
  const m = D.parseNettop(text)
  assert.deepEqual(m.get(2215), { in: 1200, out: 300 })
  assert.deepEqual(m.get(881), { in: 55, out: 66 })
  assert.deepEqual(m.get(1), { in: 0, out: 0 })
  const csv = D.parseNettop(',bytes_in,bytes_out,\nlaunchd.1,0,0,\nOrca Helper.92585,3700000,44600000,\n')
  assert.deepEqual(csv.get(92585), { in: 3700000, out: 44600000 })
})

test('ioreg GPU clients: AppUsage belongs to the creator in the same block, not the one before', () => {
  const m = D.parseGpuClients(fixture('mac-ioreg-gpu.txt'))
  assert.ok(m.get(420) > 1e12)
  assert.equal(m.get(702), 0)
  assert.equal(m.get(425), 0)
  const swapped = D.parseGpuClients('+-o C\n "AppUsage" = ({"accumulatedGPUTime"=5})\n "IOUserClientCreator" = "pid 7, a"\n+-o C\n "AppUsage" = ()\n "IOUserClientCreator" = "pid 8, b"\n')
  assert.deepEqual([...swapped], [[7, 5], [8, 0]])
})

test('pmset battery and sleep assertions', () => {
  assert.deepEqual(D.parsePmsetBatt(fixture('mac-batt.txt')), { percent: 62, state: 'discharging', source: 'Battery Power', remaining: '3:41' })
  assert.deepEqual(D.parsePmsetBatt("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true\n"), { percent: 100, state: 'charged', source: 'AC Power', remaining: '0:00' })
  assert.equal(D.parsePmsetBatt("Now drawing from 'AC Power'\n"), null)
  assert.deepEqual([...D.parseAssertions(fixture('mac-assertions.txt'))], [975])
})

test('macOS disk operations and interface packets', () => {
  assert.deepEqual(D.parseDiskOps('"Statistics" = {"Operations (Write)"=10,"Bytes (Read)"=99,"Operations (Read)"=7}\n"Statistics" = {"Operations (Read)"=3,"Operations (Write)"=1}'), { in: 10, out: 11 })
  assert.equal(D.parseDiskOps('nothing'), null)
  const netstat = fixture('netstat.txt')
  const all = D.parseNetstatPackets(netstat, null)
  assert.ok(all && all.in > 0 && all.out > 0)
  assert.equal(D.parseNetstatPackets(netstat, 'nope0'), null)
})

test('Linux packets, disk operations, io, users and battery', () => {
  const dev = 'Inter-|   Receive |  Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n    lo: 100 5 0 0 0 0 0 0 100 5 0 0 0 0 0 0\n  eth0: 9000 70 0 0 0 0 0 0 4000 30 0 0 0 0 0 0\n docker0: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\n'
  assert.deepEqual(D.parseProcNetDevPackets(dev, null), { in: 70, out: 30 })
  assert.deepEqual(D.parseProcNetDevPackets(dev, 'lo'), { in: 5, out: 5 })
  const disk = '   8       0 sda 120 0 960 10 40 0 320 5 0 0 0\n   8       1 sda1 100 0 800 9 30 0 240 4 0 0 0\n 259 0 nvme0n1 7 0 56 1 3 0 24 1 0 0 0\n'
  assert.deepEqual(D.parseDiskstatsOps(disk), { in: 127, out: 43 })
  assert.deepEqual(D.parseProcIo('rchar: 1\nwchar: 2\nread_bytes: 4096\nwrite_bytes: 8192\n'), { read: 4096, write: 8192 })
  assert.equal(D.parseProcIo(''), null)
  assert.equal(D.parseStatusUid('Name:\tbash\nUid:\t1000\t1000\t1000\t1000\n'), 1000)
  assert.equal(D.parsePasswd('root:x:0:0:root:/root:/bin/bash\nme:x:1000:1000::/home/me:/bin/zsh\n').get(1000), 'me')
  assert.deepEqual(D.linuxBattery('81\n', 'Charging\n', '1\n'), { percent: 81, state: 'charging', source: 'AC Power', remaining: null })
  assert.equal(D.linuxBattery('', 'Full', ''), null)
  const stat = parseProcStat('42 (Web Content (x)) S 1 42 42 0 -1 4194560 100 0 0 0 1000 500 0 0 20 0 7 0 777 1000 25600 0 0')
  assert.equal(stat.threads, 7)
})

test('Windows packets, CIM rows, Threads column and battery', () => {
  const netstat = 'Interface Statistics\r\n\r\n                           Received            Sent\r\n\r\nBytes                    1234567          765432\r\nUnicast packets             9000            4000\r\nNon-unicast packets           12              34\r\n'
  assert.deepEqual(D.parseWindowsPackets(netstat), { in: 9000, out: 4000 })
  const cim = '﻿"ProcessId","ThreadCount","ReadTransferCount","WriteTransferCount"\r\n"4","180","",""\r\n"1234","12","5000","7000"\r\n'
  const rows = D.parseCimProcs(cim)
  assert.deepEqual(rows.get(1234), { diskRead: 5000, diskWrite: 7000, threads: 12 })
  assert.deepEqual(rows.get(4), { diskRead: null, diskWrite: null, threads: 180 })
  const procs = parseWindowsProcs('"Id","ProcessName","CPU","WorkingSet64","Start","Threads"\r\n"1234","Code","1.5","1048576","638000000000000000","33"\r\n')
  assert.equal(procs[0].threads, 33)
  assert.deepEqual(D.parseWindowsBattery('"EstimatedChargeRemaining","BatteryStatus"\r\n"55","1"\r\n'), { percent: 55, state: 'discharging', source: 'Battery Power', remaining: null })
  assert.equal(D.parseWindowsBattery(''), null)
})

function stub(over = {}) {
  return {
    diskPath: '/', diskName: 'Root', countIrq: true, procEvery: 0, detailsEvery: 0, protectedNames: /^$/,
    info: async () => ({ performance: [], efficiency: [], model: '' }),
    note: async () => null,
    read: async () => ({ memory: { total: 1, used: 0, app: 0, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, net: null, disk: null, gpu: null }),
    procs: async () => [{ pid: 9, name: 'x', cpu: 1, mem: 1, start: 'a', threads: 4 }, { pid: 10, name: 'y', cpu: 0, mem: 1, start: 'b', threads: 6 }],
    details: async () => null,
    identify: async () => null,
    quit: async () => ({ ok: true }),
    ...over
  }
}

test('the sampler merges details by pid, counts threads, splits CPU and rates packets and disk operations', async () => {
  let pin = 1000
  let rops = 50
  let energyAsked = null
  const provider = stub({
    read: async () => ({
      memory: { total: 1, used: 0, app: 0, wired: 0, compressed: 0, cached: 0 }, swap: null, pressure: null, gpu: null,
      net: { rx: 0, tx: 0, iface: 'en0', name: 'Wi-Fi' }, disk: { read: 0, write: 0, devices: 1 },
      packets: { in: pin, out: 10 }, ops: { in: rops, out: 5 }, battery: { percent: 50, state: 'charging', source: 'AC Power', remaining: null }
    }),
    details: async (energy) => { energyAsked = energy; return { rows: new Map([[10, { user: 'me', power: 3.5, sleep: true }]]), procs: null, threads: null } }
  })
  let t = 0
  const cpus = () => [{ user: t * 3, nice: 0, sys: t, idle: t * 6, irq: 0 }]
  const sampler = createSampler({ provider, cpus, space: async () => null, settle: 0 })
  t = 1
  await sampler.read({ interval: 500 })
  await new Promise((r) => setTimeout(r, 500))
  t = 11
  pin = 1500
  rops = 150
  const r = await sampler.read({ procs: true, details: true, energy: true, interval: 500 })
  assert.equal(energyAsked, true)
  assert.deepEqual(r.procs.find((p) => p.pid === 10), { pid: 10, name: 'y', cpu: 0, mem: 1, start: 'b', threads: 6, user: 'me', power: 3.5, sleep: true })
  assert.deepEqual(r.procs.find((p) => p.pid === 9).user, undefined)
  assert.deepEqual(r.sample.counts, { procs: 2, threads: 10 })
  assert.deepEqual(Object.values(r.sample.split).map(Math.round), [30, 10, 60])
  assert.ok(r.sample.net.packetsInRate > 800 && r.sample.net.packetsInRate < 1100, String(r.sample.net.packetsInRate))
  assert.ok(r.sample.disk.readOpsRate > 150 && r.sample.disk.readOpsRate < 220, String(r.sample.disk.readOpsRate))
  assert.equal(r.sample.battery.percent, 50)
  const plain = await sampler.read({ interval: 500 })
  assert.equal(plain.procs, null)
})
