import type { OrcaWorkerApi } from 'orca/worker'
import { createServer, type Server } from 'node:http'
import { SpotifyClient, SpotifyError, type FetchFn } from './client'
import type { AuthStart, CommandResult, Device, ListView, PlayerView, QueueView, Row, SearchView } from './protocol'
import {
  authorizeUrl,
  base64url,
  commandCall,
  parseCommand,
  parseDevices,
  parsePlayer,
  playlistRow,
  REDIRECT_PORT,
  REDIRECT_URI,
  rows,
  searchRows,
  trackRow
} from './spotify'

export const REFRESH_KEY = 'refreshToken'
const AUTH_WAIT_MS = 10 * 60_000
const IMAGE_CACHE_MAX = 400
const IMAGE_HOST = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//i
const STARTS_PLAYBACK = new Set(['play', 'playContext', 'playTrack'])

export type WorkerDeps = { fetch: FetchFn; now: () => number; listen: typeof createServer }

const message = (error: unknown): string => (error instanceof SpotifyError ? error.message : 'Could not reach Spotify. Check your connection.')

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

export function startWorker(orca: OrcaWorkerApi, deps: WorkerDeps): { dispose(): void } {
  const client = new SpotifyClient({
    fetch: deps.fetch,
    now: deps.now,
    clientId: async () => {
      const value = await orca.settings.get('clientId')
      return typeof value === 'string' ? value.trim() : ''
    },
    vault: {
      get: () => orca.secrets.get(REFRESH_KEY),
      set: (value) => orca.secrets.set(REFRESH_KEY, value),
      clear: () => orca.secrets.delete(REFRESH_KEY)
    }
  })

  const images = new Map<string, string>()
  const image = async (url: string | null): Promise<string | null> => {
    if (url === null || !IMAGE_HOST.test(url)) return null
    const known = images.get(url)
    if (known) return known
    try {
      const response = await deps.fetch(url)
      if (!response.ok) return null
      const type = response.headers.get('content-type') ?? 'image/jpeg'
      if (!/^image\/(jpeg|png|webp)$/.test(type)) return null
      const data = `data:${type};base64,${bytesToBase64(await response.arrayBuffer())}`
      if (data.length > 65_536) return null
      if (images.size >= IMAGE_CACHE_MAX) images.delete(images.keys().next().value as string)
      images.set(url, data)
      return data
    } catch {
      return null
    }
  }
  const withImages = (list: Row[]): Promise<Row[]> => Promise.all(list.map(async (row) => ({ ...row, cover: await image(row.cover) })))

  const liked = new Map<string, boolean>()
  let pending: { server: Server; timer: unknown } | null = null
  const stopPending = (): void => {
    if (!pending) return
    clearTimeout(pending.timer)
    pending.server.close()
    pending = null
  }

  const signedOutView = async (text: string | null = null): Promise<PlayerView> => {
    const clientId = await orca.settings.get('clientId')
    const needsClientId = typeof clientId !== 'string' || clientId.trim() === ''
    return { status: 'signedOut', message: needsClientId ? null : text, needsClientId }
  }

  const devices = async (): Promise<Device[]> => parseDevices(await client.get('/me/player/devices'))

  orca.panels.handle('player.get', async (): Promise<PlayerView> => {
    if (!(await client.signedIn())) return signedOutView()
    try {
      const [player, list] = await Promise.all([client.get('/me/player?additional_types=episode'), devices()])
      const now = parsePlayer(player)
      if (now) {
        now.cover = await image(now.cover)
        if (now.trackId) {
          let known = liked.get(now.trackId)
          if (known === undefined) {
            const answer = await client.get(`/me/tracks/contains?ids=${encodeURIComponent(now.trackId)}`).catch(() => null)
            known = Array.isArray(answer) && answer[0] === true
            liked.set(now.trackId, known)
          }
          now.liked = known
        }
      }
      return { status: 'ok', now, devices: list, checkedAt: deps.now() }
    } catch (error) {
      if (error instanceof SpotifyError && error.signedOut) return signedOutView(error.message)
      return { status: 'error', message: message(error) }
    }
  })

  orca.panels.handle('auth.start', async (): Promise<AuthStart> => {
    const clientId = await orca.settings.get('clientId')
    if (typeof clientId !== 'string' || clientId.trim() === '') return { error: 'Add your Spotify Client ID first.' }
    stopPending()
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
    const state = base64url(crypto.getRandomValues(new Uint8Array(16)))
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
    const server = deps.listen((req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT_URI)
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const page = (text: string): void => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(`<!doctype html><title>Spotify for Orca</title><body style="font:16px system-ui;padding:40px">${text}</body>`)
      }
      if (url.searchParams.get('state') !== state || !code) {
        page('Sign-in was cancelled or did not match. Go back to Orca and try again.')
        stopPending()
        return
      }
      client.exchange(code, verifier, REDIRECT_URI).then(
        () => {
          page('Signed in. You can close this tab and go back to Orca.')
          orca.log('signed in')
          orca.panels.post('changed', null)
          stopPending()
        },
        (error: unknown) => {
          page(`${message(error)} Go back to Orca and try again.`)
          orca.log(`sign-in failed: ${message(error)}`)
          stopPending()
        }
      )
    })
    const listening = await new Promise<boolean>((resolve) => {
      server.on('error', () => resolve(false))
      server.listen(REDIRECT_PORT, '127.0.0.1', () => resolve(true))
    })
    if (!listening) return { error: `Port ${REDIRECT_PORT} is in use, so sign-in cannot finish. Close what uses it and try again.` }
    pending = { server, timer: setTimeout(stopPending, AUTH_WAIT_MS) }
    return { url: authorizeUrl(clientId.trim(), challenge, state) }
  })

  orca.panels.handle('auth.signOut', async (): Promise<{ ok: true }> => {
    stopPending()
    liked.clear()
    await client.signOut()
    return { ok: true }
  })

  orca.panels.handle('command', async (input): Promise<CommandResult> => {
    const command = parseCommand(input)
    if (!command) return { ok: false, message: 'That control did not work.' }
    try {
      let deviceId: string | null = null
      if (STARTS_PLAYBACK.has(command.action)) {
        const list = await devices()
        if (list.length === 0) return { ok: false, message: 'No device is open. Open Spotify on your Mac or phone.' }
        if (!list.some((device) => device.active)) deviceId = list[0].id
      }
      const call = commandCall(command, deviceId)
      if (!call) return { ok: false, message: 'That control did not work.' }
      await client.call(call)
      if (command.action === 'like') liked.set(command.trackId, command.on)
      return { ok: true }
    } catch (error) {
      return { ok: false, message: message(error) }
    }
  })

  orca.panels.handle('playlists.get', async (): Promise<ListView> => {
    try {
      const body = (await client.get('/me/playlists?limit=50')) as { items?: unknown } | null
      return { rows: await withImages(rows(body?.items, playlistRow)), message: null }
    } catch (error) {
      return { rows: [], message: message(error) }
    }
  })

  orca.panels.handle('playlist.tracks', async (input): Promise<ListView> => {
    const id = (input as { id?: unknown } | null)?.id
    if (typeof id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(id)) return { rows: [], message: 'That playlist did not open.' }
    try {
      const body = (await client.get(`/playlists/${id}/tracks?limit=100`)) as { items?: unknown } | null
      return { rows: await withImages(rows(body?.items, trackRow)), message: null }
    } catch (error) {
      if (error instanceof SpotifyError && (error.status === 403 || error.status === 404)) {
        return { rows: [], message: "Spotify doesn't let apps list this playlist's songs. The play button still plays it." }
      }
      return { rows: [], message: message(error) }
    }
  })

  orca.panels.handle('search', async (input): Promise<SearchView> => {
    const empty = { songs: [], artists: [], albums: [], playlists: [] }
    const query = (input as { q?: unknown } | null)?.q
    if (typeof query !== 'string' || query.trim() === '') return { ...empty, message: null }
    try {
      const body = await client.get(`/search?q=${encodeURIComponent(query.trim().slice(0, 200))}&type=track,artist,album,playlist&limit=5`)
      const found = searchRows(body)
      return {
        songs: await withImages(found.songs),
        artists: await withImages(found.artists),
        albums: await withImages(found.albums),
        playlists: await withImages(found.playlists),
        message: null
      }
    } catch (error) {
      return { ...empty, message: message(error) }
    }
  })

  orca.panels.handle('queue.get', async (): Promise<QueueView> => {
    try {
      const body = (await client.get('/me/player/queue')) as { currently_playing?: unknown; queue?: unknown } | null
      const now = trackRow(body?.currently_playing)
      const next = rows(body?.queue, trackRow).slice(0, 20)
      const [nowRow] = now ? await withImages([now]) : [null]
      return { now: nowRow, next: await withImages(next), message: null }
    } catch (error) {
      return { now: null, next: [], message: message(error) }
    }
  })

  return { dispose: stopPending }
}

let running: { dispose(): void } | null = null

export default function activate(orca: OrcaWorkerApi): void {
  running = startWorker(orca, { fetch: fetch as unknown as FetchFn, now: () => Date.now(), listen: createServer })
}

export function deactivate(): void {
  running?.dispose()
  running = null
}
