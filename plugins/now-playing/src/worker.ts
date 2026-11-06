import type { OrcaWorkerApi } from 'orca/worker'
import { createServer, type Server } from 'node:http'
import { execFile } from 'node:child_process'
import { SpotifyClient, SpotifyError, type FetchFn } from './client'
import type { AuthStart, CommandResult, Device, LibraryView, ListView, PlayerView, QueueView, Row, SearchView } from './protocol'
import {
  authorizeUrl,
  base64url,
  commandCall,
  daylistUri,
  DJ_URI,
  followedArtistRows,
  parseCommand,
  parseDevices,
  parsePlayer,
  playlistRow,
  REDIRECT_PORT,
  REDIRECT_URI,
  rows,
  savedAlbumRows,
  searchRows,
  trackRow
} from './spotify'

export const REFRESH_KEY = 'refreshToken'
const AUTH_WAIT_MS = 10 * 60_000
const IMAGE_CACHE_MAX = 400
const IMAGE_BATCH = 12
const DEVICES_MS = 30_000
const IMAGE_MAX_CHARS = 200_000
const ANSWER_BUDGET = 800_000
const IMAGE_HOST = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//i
const STARTS_PLAYBACK = new Set(['play', 'playContext', 'playTrack'])

export type RunFn = (file: string, args: readonly string[]) => Promise<void>
export type WorkerDeps = { fetch: FetchFn; now: () => number; listen: typeof createServer; run: RunFn; platform: string }

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
      if (data.length > IMAGE_MAX_CHARS) return null
      if (images.size >= IMAGE_CACHE_MAX) images.delete(images.keys().next().value as string)
      images.set(url, data)
      return data
    } catch {
      return null
    }
  }

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

  let deviceCache: { at: number; list: Device[] } | null = null
  const devices = async (force = false): Promise<Device[]> => {
    if (!force && deviceCache && deps.now() - deviceCache.at < DEVICES_MS) return deviceCache.list
    const list = parseDevices(await client.get('/me/player/devices'))
    deviceCache = { at: deps.now(), list }
    return list
  }

  orca.panels.handle('player.get', async (): Promise<PlayerView> => {
    if (!(await client.signedIn())) return signedOutView()
    try {
      const player = await client.get('/me/player?additional_types=episode')
      const playing = (player as { device?: { id?: unknown } } | null)?.device?.id
      const cached = await devices()
      const list = typeof playing === 'string' && !cached.some((device) => device.id === playing) ? await devices(true) : cached
      const now = parsePlayer(player)
      if (now) {
        if (now.trackId) {
          let known = liked.get(now.trackId)
          if (known === undefined) {
            const answer = await client.get(`/me/tracks/contains?ids=${encodeURIComponent(now.trackId)}`).catch(() => null)
            if (Array.isArray(answer)) {
              known = answer[0] === true
              liked.set(now.trackId, known)
            }
          }
          now.liked = known ?? null
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

  orca.panels.handle('images.get', async (input): Promise<Record<string, string | null>> => {
    const urls = (input as { urls?: unknown } | null)?.urls
    if (!Array.isArray(urls)) return {}
    const wanted = urls.filter((url): url is string => typeof url === 'string').slice(0, IMAGE_BATCH)
    const found = await Promise.all(wanted.map(async (url) => [url, await image(url)] as const))
    const answer: Record<string, string | null> = {}
    let used = 0
    for (const [url, data] of found) {
      if (data !== null && used + data.length > ANSWER_BUDGET) continue
      answer[url] = data
      used += data?.length ?? 0
    }
    return answer
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
    if (command.action === 'dj') {
      if (deps.platform !== 'darwin') return { ok: false, message: 'DJ can only start on a Mac.' }
      try {
        await deps.run('osascript', ['-e', 'set prior to path to frontmost application as text', '-e', `tell application "Spotify" to play track "${DJ_URI}"`, '-e', 'delay 0.4', '-e', 'tell application prior to activate', '-e', 'delay 0.8', '-e', 'tell application prior to activate'])
        return { ok: true }
      } catch {
        return { ok: false, message: 'Could not start DJ. Is the Spotify app installed on this Mac?' }
      }
    }
    try {
      let deviceId: string | null = null
      if (STARTS_PLAYBACK.has(command.action)) {
        let list = await devices()
        if (list.length === 0) list = await devices(true)
        if (list.length === 0) return { ok: false, message: 'No device is open. Open Spotify on your Mac or phone.' }
        if (!list.some((device) => device.active)) deviceId = list[0].id
      }
      const call = commandCall(command, deviceId)
      if (!call) return { ok: false, message: 'That control did not work.' }
      await client.call(call)
      if (command.action === 'like') liked.set(command.trackId, command.on)
      if (command.action === 'transfer' || command.action === 'volume') deviceCache = null
      return { ok: true }
    } catch (error) {
      return { ok: false, message: message(error) }
    }
  })

  const optional = async (path: string): Promise<{ body: unknown; denied: boolean }> => {
    try {
      return { body: await client.get(path), denied: false }
    } catch (error) {
      if (error instanceof SpotifyError && error.status === 403) return { body: null, denied: true }
      throw error
    }
  }

  orca.panels.handle('library.get', async (): Promise<LibraryView> => {
    const empty: LibraryView = { made: [], playlists: [], artists: [], albums: [], needsReauth: false, message: null }
    try {
      const [me, lists, likedSongs, albums, artists, recent] = await Promise.all([
        client.get('/me'),
        client.get('/me/playlists?limit=50'),
        optional('/me/tracks?limit=1'),
        optional('/me/albums?limit=50'),
        optional('/me/following?type=artist&limit=50'),
        optional('/me/player/recently-played?limit=50')
      ])
      const userId = (me as { id?: unknown } | null)?.id
      const made: Row[] = []
      if (typeof userId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(userId)) {
        const total = (likedSongs.body as { total?: unknown } | null)?.total
        made.push({ kind: 'liked', id: 'liked', uri: `spotify:user:${userId}:collection`, name: 'Liked Songs', sub: typeof total === 'number' ? `${total} ${total === 1 ? 'song' : 'songs'}` : 'Playlist', cover: null })
      }
      if (deps.platform === 'darwin') made.push({ kind: 'dj', id: 'dj', uri: DJ_URI, name: 'DJ', sub: 'Plays in the Spotify app on this Mac', cover: null })
      const daylist = daylistUri(recent.body)
      if (daylist) made.push({ kind: 'daylist', id: daylist.split(':')[2], uri: daylist, name: 'daylist', sub: 'Made for you · changes through the day', cover: null })
      return {
        made,
        playlists: (rows((lists as { items?: unknown } | null)?.items, playlistRow)),
        artists: (followedArtistRows(artists.body)),
        albums: (savedAlbumRows(albums.body)),
        needsReauth: likedSongs.denied || albums.denied || artists.denied || recent.denied,
        message: null
      }
    } catch (error) {
      return { ...empty, message: message(error) }
    }
  })

  const TRACK_PATHS: Record<string, (id: string) => string> = {
    playlist: (id) => `/playlists/${id}/tracks?limit=100`,
    album: (id) => `/albums/${id}/tracks?limit=50`,
    artist: (id) => `/artists/${id}/top-tracks?market=from_token`,
    liked: () => '/me/tracks?limit=50'
  }

  orca.panels.handle('tracks.get', async (input): Promise<ListView> => {
    const kind = (input as { kind?: unknown } | null)?.kind
    const id = (input as { id?: unknown } | null)?.id
    const path = typeof kind === 'string' ? TRACK_PATHS[kind] : undefined
    if (!path || typeof id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(id)) return { rows: [], message: 'That did not open.' }
    try {
      const body = (await client.get(path(id))) as { items?: unknown; tracks?: unknown } | null
      return { rows: (rows(kind === 'artist' ? body?.tracks : body?.items, trackRow)), message: null }
    } catch (error) {
      if (kind === 'playlist' && error instanceof SpotifyError && (error.status === 403 || error.status === 404)) {
        return { rows: [], message: "Spotify doesn't let apps list this playlist's songs. The play button still plays it." }
      }
      if (kind === 'artist' && error instanceof SpotifyError && (error.status === 403 || error.status === 404)) {
        return { rows: [], message: "Spotify doesn't let apps list this artist's top songs. The play button still plays them." }
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
        songs: (found.songs),
        artists: (found.artists),
        albums: (found.albums),
        playlists: (found.playlists),
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
      return { now, next, message: null }
    } catch (error) {
      return { now: null, next: [], message: message(error) }
    }
  })

  return { dispose: stopPending }
}

let running: { dispose(): void } | null = null

export default function activate(orca: OrcaWorkerApi): void {
  const run: RunFn = (file, args) =>
    new Promise((resolve, reject) => {
      execFile(file, args, { timeout: 10_000 }, (error) => (error ? reject(error) : resolve()))
    })
  running = startWorker(orca, { fetch: fetch as unknown as FetchFn, now: () => Date.now(), listen: createServer, run, platform: process.platform })
}

export function deactivate(): void {
  running?.dispose()
  running = null
}
