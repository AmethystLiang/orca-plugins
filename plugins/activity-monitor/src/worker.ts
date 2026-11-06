import type { OrcaWorkerApi } from 'orca/worker'
import { createSampler } from './sampler.ts'
import type { Level } from './health.ts'
import { buildPrompt, pickAgent } from './explain.ts'
import type { AgentRow, ExplainInput } from './explain.ts'
import { nodeDeps } from './deps.ts'

type HostCall = (method: string, params: Record<string, unknown>) => Promise<unknown>

const PULSE_MS = 3000
const BADGE: Record<Level, { visible: boolean; text?: string; tone?: string }> = {
  ok: { visible: false },
  warn: { visible: false },
  risk: { visible: true, text: 'Critical', tone: 'danger' },
  crit: { visible: true, text: 'Critical', tone: 'danger' }
}

let timer: ReturnType<typeof setInterval> | null = null

export default function activate(orca: OrcaWorkerApi): void {
  const sampler = createSampler()
  const host = (orca as unknown as { host?: { call?: HostCall } }).host
  const log = (orca as unknown as { log?: (...args: unknown[]) => void }).log
  const call: HostCall = (method, params) =>
    (host && host.call ? host.call(method, params) : Promise.reject(new Error('no host.call'))).catch((error: unknown) => {
      if (log) log(method + ' failed: ' + (error instanceof Error ? error.message : String(error)))
      return null
    })
  let shown: Level | null = null

  function badge(level: Level, tooltip: string): void {
    const next = BADGE[level]
    if (shown !== null && BADGE[shown].visible === next.visible && (!next.visible || shown === level)) return
    shown = level
    void call('statusBar.update', { id: 'health', ...next, icon: 'warning', tooltip })
  }

  sampler.onAlert((alert) => {
    if (alert.kind === 'notify') void call('notifications.show', { title: alert.title, body: alert.body })
  })

  orca.panels.handle('stats.read', async (input) => {
    const out = await sampler.read(input ?? {})
    badge(out.health.level, out.health.cause)
    return out
  })
  orca.panels.handle('health.suspects', async () => sampler.suspects())
  orca.panels.handle('process.quit', async (input) =>
    sampler.quit(Number(input?.pid), String(input?.name ?? ''), input?.start ? String(input.start) : null, input?.force === true)
  )

  async function processPath(pid: number): Promise<string | null> {
    if (process.platform === 'win32' || !Number.isInteger(pid) || pid <= 0) return null
    const out = await nodeDeps.run('ps', ['-p', String(pid), '-o', 'comm='])
    return out ? out.trim() || null : null
  }

  orca.panels.handle('process.explain', async (input) => {
    const raw = (input ?? {}) as ExplainInput
    if (!host || !host.call) return { ok: false, reason: 'This Orca cannot send to agents' }
    const prompt = buildPrompt({ ...raw, platform: process.platform }, await processPath(Number(raw.pid)))
    if (!prompt) return { ok: false, reason: 'That process is gone' }
    try {
      const listed = (await host.call('agents.list', {})) as { agents?: AgentRow[] } | null
      const pick = pickAgent(listed?.agents ?? [])
      if (!pick.ok) return { ok: false, reason: pick.reason, prompt }
      const sent = (await host.call('terminal.sendText', { terminalId: pick.terminalId, text: prompt, enter: true })) as { accepted?: boolean } | null
      if (!sent?.accepted) return { ok: false, reason: 'Your agent did not take the question', prompt }
      return { ok: true, title: pick.title }
    } catch (error: unknown) {
      const code = (error as { code?: string } | null)?.code
      if (log) log('process.explain failed: ' + (error instanceof Error ? error.message : String(error)))
      const reason = code === 'capability_denied' || code === 'consent_required'
        ? 'Allow agent access for Activity Monitor in Orca plugin settings'
        : 'Could not reach your agent'
      return { ok: false, reason, prompt }
    }
  })

  badge('ok', '')
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    sampler.pulse().then(() => {
      const h = sampler.health()
      badge(h.level, h.cause)
    }, () => undefined)
  }, PULSE_MS)
}

export function deactivate(): void {
  if (timer) clearInterval(timer)
  timer = null
}
