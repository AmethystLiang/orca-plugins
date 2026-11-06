import type { JsonValue, OrcaWorkerApi } from 'orca/worker'
import { createServer, type Server } from 'node:http'
import { execFile } from 'node:child_process'
import { SpotifyClient, SpotifyError, type FetchFn } from './client'
import { LOCAL_STATE_SCRIPT, localArgs, localCommand, localPlay, parseLocal, type LocalState } from './local'
import { ART, musicArtScript, MUSIC_ARTWORK_SCRIPT, MUSIC_DEVICES_SCRIPT, MUSIC_LIBRARY_SCRIPT, MUSIC_STATE_SCRIPT, musicCommand, musicLibraryView, musicPlay, musicSearch, musicTracks, parseMusicDevices, parseMusicLibrary, parseMusicState, type MusicLibrary } from './music'
import type { App, AuthStart, CommandResult, Device, LibraryView, ListView, NowPlaying, PlayerView, Setup, QueueView, Row, SearchView } from './protocol'
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
const WEB_PLAYER_MS = 15_000
const IMAGE_MAX_CHARS = 400_000
const ANSWER_BUDGET = 800_000
const IMAGE_HOST = /^https:\/\/([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com)\//i
const STARTS_PLAYBACK = new Set(['play', 'playContext', 'playTrack'])

export type RunFn = (file: string, args: readonly string[]) => Promise<string>
export type WorkerDeps = { fetch: FetchFn; now: () => number; listen: typeof createServer; run: RunFn; platform: string }

const apiDown = (error: unknown): boolean => !(error instanceof SpotifyError) || error.status === 429 || error.status >= 500
const LIBRARY_KEY = 'libraryCache'
const TRACKS_KEY = 'tracksCache'
const TRACKS_KEEP = 30
const APP_KEY = 'app'
const PAUSE_KEY = 'pausedUntil'
const HISTORY_KEY = 'history'
const HISTORY_MAX = 50
const SYNC_KEY = 'syncedAt'
const SYNC_MS = 24 * 60 * 60_000
const SYNC_LISTS = 10
const SYNC_GAP_MS = 3000
const MUSIC_LIBRARY_MS = 5 * 60_000
const COVER_BIN = '/tmp/orca-now-playing-cover.bin'
const COVER_JPG = '/tmp/orca-now-playing-cover.jpg'

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
    pauses: {
      get: () => orca.storage.get(PAUSE_KEY),
      set: (until) => orca.storage.set(PAUSE_KEY, until)
    },
    vault: {
      get: () => orca.secrets.get(REFRESH_KEY),
      set: (value) => orca.secrets.set(REFRESH_KEY, value),
      clear: () => orca.secrets.delete(REFRESH_KEY)
    }
  })

  const pause = (ms: number): Promise<void> => new Promise((resolve) => void setTimeout(resolve, ms))
  const images = new Map<string, string>()
  const musicArt = async (url: string): Promise<string | null> => {
    const args = musicArtScript(url, COVER_BIN.replace('.bin', '-list.bin'))
    if (!args) return null
    try {
      if ((await deps.run('osascript', args)).trim() !== 'ok') return null
      await deps.run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '160', COVER_BIN.replace('.bin', '-list.bin'), '--out', COVER_JPG.replace('.jpg', '-list.jpg')])
      return `data:image/jpeg;base64,${(await deps.run('/usr/bin/base64', ['-i', COVER_JPG.replace('.jpg', '-list.jpg')])).replace(/\s+/g, '')}`
    } catch {
      return null
    }
  }

  let artQueue: Promise<unknown> = Promise.resolve()
  const image = async (url: string | null): Promise<string | null> => {
    if (url === null) return null
    const known = images.get(url)
    if (known) return known
    if (ART.test(url)) {
      const next = artQueue.then(() => musicArt(url))
      artQueue = next.catch(() => null)
      const data = await next
      if (data && data.length <= IMAGE_MAX_CHARS) {
        if (images.size >= IMAGE_CACHE_MAX) images.delete(images.keys().next().value as string)
        images.set(url, data)
      }
      return data
    }
    if (!IMAGE_HOST.test(url)) return null
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
    return { status: 'signedOut', message: needsClientId ? null : text, needsClientId, mac: deps.platform === 'darwin' }
  }

  let deviceCache: { at: number; list: Device[] } | null = null
  const devices = async (force = false): Promise<Device[]> => {
    if (!force && deviceCache && deps.now() - deviceCache.at < DEVICES_MS) return deviceCache.list
    const list = parseDevices(await client.get('/me/player/devices'))
    deviceCache = { at: deps.now(), list }
    return list
  }

  let source: 'local' | 'web' = 'web'
  let webCache: { at: number; player: unknown } | null = null

  const local = async (): Promise<LocalState | null> => {
    if (deps.platform !== 'darwin') return null
    try {
      return parseLocal(await deps.run('osascript', localArgs(LOCAL_STATE_SCRIPT)))
    } catch {
      return null
    }
  }

  const webPlayer = async (): Promise<unknown> => {
    if (webCache && deps.now() - webCache.at < WEB_PLAYER_MS) return webCache.player
    const player = await client.get('/me/player?additional_types=episode')
    webCache = { at: deps.now(), player }
    return player
  }

  const withLiked = async (now: NowPlaying): Promise<NowPlaying> => {
    if (!now.trackId) return now
    let known = liked.get(now.trackId)
    if (known === undefined) {
      const answer = await client.get(`/me/tracks/contains?ids=${encodeURIComponent(now.trackId)}`).catch(() => null)
      if (Array.isArray(answer)) {
        known = answer[0] === true
        liked.set(now.trackId, known)
      }
    }
    return { ...now, liked: known ?? null }
  }

  let chosen: App | null | undefined
  const currentApp = async (): Promise<App | null> => {
    if (chosen === undefined) {
      const saved = await orca.storage.get(APP_KEY).catch(() => null)
      chosen = saved === 'spotify' || saved === 'music' ? saved : null
    }
    if (chosen === null && deps.platform !== 'darwin') return 'spotify'
    return chosen
  }

  let musicLibrary: { at: number; library: MusicLibrary } | null = null
  const loadMusicLibrary = async (force = false): Promise<MusicLibrary | null> => {
    if (!force && musicLibrary && deps.now() - musicLibrary.at < MUSIC_LIBRARY_MS) return musicLibrary.library
    const library = parseMusicLibrary(await deps.run('osascript', localArgs(MUSIC_LIBRARY_SCRIPT)))
    if (library) musicLibrary = { at: deps.now(), library }
    return library
  }

  let musicCover: { id: string; data: string | null } | null = null
  const lookupCover = async (name: string, artist: string): Promise<string | null> => {
    try {
      const term = encodeURIComponent(`${artist} ${name}`.slice(0, 120))
      const response = await deps.fetch(`https://itunes.apple.com/search?term=${term}&entity=song&media=music&limit=1`)
      if (!response.ok) return null
      const body = (await response.json()) as { results?: { artworkUrl100?: unknown }[] } | null
      const small = body?.results?.[0]?.artworkUrl100
      if (typeof small !== 'string' || !/^https:\/\/is\d+-ssl\.mzstatic\.com\//.test(small)) return null
      const art = await deps.fetch(small.replace(/\/\d+x\d+bb\./, '/600x600bb.'))
      const type = art.headers.get('content-type') ?? 'image/jpeg'
      if (!art.ok || !/^image\/(jpeg|png|webp)$/.test(type)) return null
      const data = `data:${type};base64,${bytesToBase64(await art.arrayBuffer())}`
      return data.length <= IMAGE_MAX_CHARS ? data : null
    } catch {
      return null
    }
  }

  const coverFor = async (id: string, lookup: { name: string; artist: string } | null): Promise<string | null> => {
    if (musicCover?.id === id) return musicCover.data
    musicCover = { id, data: null }
    if (lookup && lookup.artist) {
      const found = await lookupCover(lookup.name, lookup.artist)
      if (found) {
        if (musicCover.id === id) musicCover.data = found
        return found
      }
    }
    try {
      if ((await deps.run('osascript', MUSIC_ARTWORK_SCRIPT(COVER_BIN))).trim() !== 'ok') return null
      await deps.run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-Z', '640', COVER_BIN, '--out', COVER_JPG])
      const data = `data:image/jpeg;base64,${(await deps.run('/usr/bin/base64', ['-i', COVER_JPG])).replace(/\s+/g, '')}`
      if (data.length > IMAGE_MAX_CHARS) return null
      if (musicCover.id === id) musicCover.data = data
      return data
    } catch {
      return null
    }
  }

  const musicDevices = async (): Promise<Device[]> => {
    try {
      return parseMusicDevices(await deps.run('osascript', localArgs(MUSIC_DEVICES_SCRIPT)))
    } catch {
      return []
    }
  }

  const musicView = async (): Promise<PlayerView> => {
    let state = null
    try {
      state = parseMusicState(await deps.run('osascript', localArgs(MUSIC_STATE_SCRIPT)))
    } catch {
      state = null
    }
    const base = { status: 'ok' as const, app: 'music' as const, devices: [], checkedAt: deps.now(), setup: 'connected' as const, pausedMs: 0 }
    if (!state || (state.status !== 'playing' && state.status !== 'paused')) return { ...base, now: null, devices: [{ id: 'local', name: 'This Mac', type: 'Computer', active: true, volume: state?.status === 'stopped' ? state.volume : null }] }
    const now = state.now
    const cover = now.trackId ? await coverFor(`${now.trackId}|${now.name}|${now.artists}|${now.album}`, now.durationMs === 0 ? { name: now.name, artist: now.artists } : null) : null
    return { ...base, now: { ...now, cover, device: { id: 'local', name: 'This Mac', type: 'Computer', active: true, volume: state.volume } } }
  }

  const setupState = async (): Promise<Setup> => {
    if (await client.signedIn()) return 'connected'
    const clientId = await orca.settings.get('clientId')
    return typeof clientId === 'string' && clientId.trim() !== '' ? 'signIn' : 'clientId'
  }

  const localView = async (mine: Extract<LocalState, { now: NowPlaying }>, setup: Setup): Promise<PlayerView> => {
    source = 'local'
    const pausedMs = setup === 'connected' ? client.pausedFor() : 0
    const live = setup === 'connected' && pausedMs === 0
    const list = live ? (deviceCache?.list ?? []) : []
    const mac = list.find((device) => device.active && device.type === 'Computer') ?? { id: 'local', name: 'This Mac', type: 'Computer', active: true, volume: null }
    const base = { ...mine.now, device: { ...mac, volume: mine.volume } }
    const now = live ? await withLiked(base) : base
    return { status: 'ok', app: 'spotify', now, devices: list, checkedAt: deps.now(), setup, pausedMs }
  }

  orca.panels.handle('app.set', async (input): Promise<{ ok: boolean }> => {
    const value = (input as { app?: unknown } | null)?.app
    if (value !== 'spotify' && value !== 'music') return { ok: false }
    if (value === 'music' && deps.platform !== 'darwin') return { ok: false }
    chosen = value
    musicCover = null
    await orca.storage.set(APP_KEY, value).catch(() => undefined)
    return { ok: true }
  })

  orca.panels.handle('player.get', async (): Promise<PlayerView> => {
    const which = await currentApp()
    if (which === null) return { status: 'choose', mac: deps.platform === 'darwin' }
    if (which === 'music') return musicView()
    const answer = await spotifyView()
    if (answer.status === 'ok') {
      if (answer.now) void remember(answer.now)
      if (answer.setup === 'connected' && answer.pausedMs === 0) void maybeSync()
    }
    return answer
  })

  const spotifyView = async (): Promise<PlayerView> => {
    await client.ready()
    const setup = await setupState()
    const mine = await local()
    const onMac = mine && (mine.status === 'playing' || mine.status === 'paused') ? mine : null
    if (setup !== 'connected') {
      if (onMac) return localView(onMac, setup)
      return signedOutView()
    }
    if (onMac && (onMac.status === 'playing' || client.pausedFor() > 0)) return localView(onMac, setup)
    try {
      const webNow = parsePlayer(await webPlayer())
      if (!webNow?.isPlaying && onMac) return localView(onMac, setup)
      source = 'web'
      const list = await devices()
      return { status: 'ok', app: 'spotify', now: webNow ? await withLiked(webNow) : null, devices: list, checkedAt: deps.now(), setup, pausedMs: 0 }
    } catch (error) {
      if (error instanceof SpotifyError && error.signedOut) return signedOutView(error.message)
      if (onMac) return localView(onMac, setup)
      return { status: 'error', message: message(error) }
    }
  }

  orca.panels.handle('devices.get', async (): Promise<Device[]> => {
    if ((await currentApp()) === 'music') return musicDevices()
    try {
      return await devices(true)
    } catch {
      return deviceCache?.list ?? []
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
    if ((await currentApp()) === 'music') {
      const args = command.action === 'playContext' ? musicPlay(musicLibrary?.library ?? null, command.contextUri, command.offsetUri) : command.action === 'playTrack' ? musicPlay(null, command.uri) : musicCommand(command)
      if (!args) return { ok: false, message: 'Apple Music cannot do that from here.' }
      try {
        const skip = command.action === 'next' || command.action === 'previous'
        const before = skip ? parseMusicState(await deps.run('osascript', localArgs(MUSIC_STATE_SCRIPT))) : null
        await deps.run('osascript', args)
        if (before && before.status === 'playing' && before.now.durationMs === 0) {
          await pause(900)
          const after = parseMusicState(await deps.run('osascript', localArgs(MUSIC_STATE_SCRIPT)))
          if (after && after.status === 'playing' && after.now.name === before.now.name) return { ok: false, message: "Live radio can't skip songs." }
        }
        return { ok: true }
      } catch {
        return { ok: false, message: 'The Music app on this Mac did not respond.' }
      }
    }
    if (command.action === 'openApp') {
      if (deps.platform !== 'darwin') return { ok: false, message: 'Opening the app works on a Mac.' }
      try {
        await deps.run('osascript', ['-e', 'tell application "Spotify" to activate'])
        return { ok: true }
      } catch {
        return { ok: false, message: 'Could not open the Spotify app.' }
      }
    }
    if (command.action === 'dj') {
      if (deps.platform !== 'darwin') return { ok: false, message: 'DJ can only start on a Mac.' }
      try {
        await deps.run('osascript', ['-e', 'set prior to path to frontmost application as text', '-e', `tell application "Spotify" to play track "${DJ_URI}"`, '-e', 'delay 0.4', '-e', 'tell application prior to activate', '-e', 'delay 0.8', '-e', 'tell application prior to activate'])
        return { ok: true }
      } catch {
        return { ok: false, message: 'Could not start DJ. Is the Spotify app installed on this Mac?' }
      }
    }
    const direct = source === 'local' ? localCommand(command) : null
    if (direct) {
      try {
        await deps.run('osascript', direct)
        return { ok: true }
      } catch {
        return { ok: false, message: 'The Spotify app on this Mac did not respond.' }
      }
    }
    const viaApp = async (): Promise<CommandResult | null> => {
      if (deps.platform !== 'darwin') return null
      const args = command.action === 'playContext' ? localPlay(command.offsetUri ?? command.contextUri, command.offsetUri ? command.contextUri : undefined) : command.action === 'playTrack' ? localPlay(command.uri) : null
      if (!args) return null
      try {
        await deps.run('osascript', args)
        return { ok: true }
      } catch {
        return { ok: false, message: 'The Spotify app on this Mac did not respond.' }
      }
    }
    if (!(await client.signedIn())) return (await viaApp()) ?? { ok: false, message: 'Connect your Spotify account to do that.' }
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
      webCache = null
      return { ok: true }
    } catch (error) {
      if (apiDown(error)) {
        const fallback = await viaApp()
        if (fallback) return fallback
      }
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

  const libraryGet = async (input: unknown): Promise<LibraryView> => {
    const empty: LibraryView = { made: [], playlists: [], artists: [], albums: [], needsReauth: false, message: null }
    if ((await currentApp()) === 'music') {
      try {
        const library = await loadMusicLibrary((input as { force?: unknown } | null)?.force === true)
        return library ? musicLibraryView(library) : { ...empty, message: 'Open the Music app to see your library.' }
      } catch {
        return { ...empty, message: 'The Music app did not answer. Try again in a moment.' }
      }
    }
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
      const view: LibraryView = {
        made,
        playlists: rows((lists as { items?: unknown } | null)?.items, playlistRow),
        artists: followedArtistRows(artists.body),
        albums: savedAlbumRows(albums.body),
        needsReauth: likedSongs.denied || albums.denied || artists.denied || recent.denied,
        message: null,
        savedAt: null
      }
      await orca.storage.set(LIBRARY_KEY, { at: deps.now(), view } as unknown as JsonValue).catch(() => undefined)
      return view
    } catch (error) {
      if (apiDown(error)) {
        const saved = (await orca.storage.get(LIBRARY_KEY).catch(() => null)) as { at?: unknown; view?: LibraryView } | null
        if (saved?.view && typeof saved.at === 'number') return { ...saved.view, needsReauth: false, message: null, savedAt: saved.at }
      }
      const made: Row[] = deps.platform === 'darwin' ? [{ kind: 'dj', id: 'dj', uri: DJ_URI, name: 'DJ', sub: 'Plays in the Spotify app on this Mac', cover: null }] : []
      return { ...empty, made, message: apiDown(error) ? `${message(error)} Your library shows here once it loads.` : message(error) }
    }
  }
  orca.panels.handle('library.get', libraryGet)

  const TRACK_PATHS: Record<string, (id: string) => string> = {
    playlist: (id) => `/playlists/${id}/tracks?limit=100`,
    album: (id) => `/albums/${id}/tracks?limit=50`,
    artist: (id) => `/artists/${id}/top-tracks?market=from_token`,
    liked: () => '/me/tracks?limit=50'
  }

  const tracksGet = async (input: unknown): Promise<ListView> => {
    const kind = (input as { kind?: unknown } | null)?.kind
    const id = (input as { id?: unknown } | null)?.id
    if ((await currentApp()) === 'music') {
      const library = await loadMusicLibrary().catch(() => null)
      const found = library && typeof kind === 'string' && typeof id === 'string' ? musicTracks(library, kind, id) : null
      if (found) return found
      if (kind === 'playlist' && typeof id === 'string' && /^[A-F0-9]{16}$/.test(id)) return { rows: [], message: 'Press play to hear this playlist.' }
      return { rows: [], message: 'That did not open.' }
    }
    const path = typeof kind === 'string' ? TRACK_PATHS[kind] : undefined
    if (!path || typeof id !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(id)) return { rows: [], message: 'That did not open.' }
    try {
      const body = (await client.get(path(id))) as { items?: unknown; tracks?: unknown } | null
      const list: ListView = { rows: rows(kind === 'artist' ? body?.tracks : body?.items, trackRow), message: null, savedAt: null }
      const saved = ((await orca.storage.get(TRACKS_KEY).catch(() => null)) ?? {}) as Record<string, { at: number; rows: Row[] }>
      const key = `${kind}:${id}`
      const kept = Object.entries(saved).filter(([name]) => name !== key).sort((a, b) => b[1].at - a[1].at).slice(0, TRACKS_KEEP - 1)
      await orca.storage.set(TRACKS_KEY, Object.fromEntries([[key, { at: deps.now(), rows: list.rows }], ...kept]) as unknown as JsonValue).catch(() => undefined)
      return list
    } catch (error) {
      if (apiDown(error)) {
        const saved = ((await orca.storage.get(TRACKS_KEY).catch(() => null)) ?? {}) as Record<string, { at: number; rows: Row[] }>
        const hit = saved[`${kind}:${id}`]
        if (hit) return { rows: hit.rows, message: null, savedAt: hit.at }
        return { rows: [], message: "Spotify's API is paused, and these songs weren't saved yet. The play button still works." }
      }
      if (kind === 'playlist' && error instanceof SpotifyError && (error.status === 403 || error.status === 404)) {
        return { rows: [], message: "Spotify doesn't let apps list this playlist's songs. The play button still plays it." }
      }
      if (kind === 'artist' && error instanceof SpotifyError && (error.status === 403 || error.status === 404)) {
        return { rows: [], message: "Spotify doesn't let apps list this artist's top songs. The play button still plays them." }
      }
      return { rows: [], message: message(error) }
    }
  }
  orca.panels.handle('tracks.get', tracksGet)

  orca.panels.handle('search', async (input): Promise<SearchView> => {
    const empty = { songs: [], artists: [], albums: [], playlists: [] }
    const query = (input as { q?: unknown } | null)?.q
    if (typeof query !== 'string' || query.trim() === '') return { ...empty, message: null }
    if ((await currentApp()) === 'music') {
      const library = await loadMusicLibrary().catch(() => null)
      return library ? musicSearch(library, query) : { ...empty, message: 'Open the Music app to search your library.' }
    }
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
      if (apiDown(error)) {
        const saved = await savedSearch(query)
        if (saved) return saved
      }
      return { ...empty, message: message(error) }
    }
  })

  let lastHeard: string | null = null
  const remember = async (now: NowPlaying): Promise<void> => {
    if (!now.trackId || !now.uri?.startsWith('spotify:track:') || now.uri === lastHeard) return
    lastHeard = now.uri
    const row: Row = { kind: 'track', id: now.trackId, uri: now.uri, name: now.name, sub: now.artists, cover: now.cover?.startsWith('https://') ? now.cover : null }
    const saved = await orca.storage.get(HISTORY_KEY).catch(() => null)
    const list = Array.isArray(saved) ? (saved as unknown as Row[]) : []
    await orca.storage.set(HISTORY_KEY, [row, ...list.filter((other) => other.uri !== row.uri)].slice(0, HISTORY_MAX) as unknown as JsonValue).catch(() => undefined)
  }

  orca.panels.handle('history.get', async (): Promise<Row[]> => {
    if ((await currentApp()) !== 'spotify') return []
    const saved = await orca.storage.get(HISTORY_KEY).catch(() => null)
    return Array.isArray(saved) ? (saved as unknown as Row[]) : []
  })

  let syncing = false
  const maybeSync = async (): Promise<void> => {
    if (syncing || client.pausedFor() > 0) return
    const last = await orca.storage.get(SYNC_KEY).catch(() => null)
    if (typeof last === 'number' && deps.now() - last < SYNC_MS) return
    syncing = true
    try {
      await orca.storage.set(SYNC_KEY, deps.now())
      const view = await libraryGet(null)
      if (view.message || view.savedAt) return
      const lists = [...view.made.filter((row) => row.kind === 'liked'), ...view.playlists.slice(0, SYNC_LISTS), ...view.albums.slice(0, SYNC_LISTS)]
      for (const row of lists) {
        await pause(SYNC_GAP_MS)
        if (client.pausedFor() > 0 || (await currentApp()) !== 'spotify') break
        await tracksGet({ kind: row.kind, id: row.id })
      }
      orca.log(`synced library and ${lists.length} lists`)
    } catch {
      return
    } finally {
      syncing = false
    }
  }

  const savedSearch = async (query: string): Promise<SearchView | null> => {
    const library = (await orca.storage.get(LIBRARY_KEY).catch(() => null)) as { at?: unknown; view?: LibraryView } | null
    const tracks = ((await orca.storage.get(TRACKS_KEY).catch(() => null)) ?? {}) as Record<string, { at: number; rows: Row[] }>
    if (!library?.view && Object.keys(tracks).length === 0) return null
    const q = query.trim().toLowerCase()
    const has = (row: Row): boolean => row.name.toLowerCase().includes(q) || row.sub.toLowerCase().includes(q)
    const seen = new Set<string>()
    const songs: Row[] = []
    for (const entry of Object.values(tracks)) {
      for (const row of entry.rows) {
        if (songs.length >= 8 || seen.has(row.uri) || !has(row)) continue
        seen.add(row.uri)
        songs.push(row)
      }
    }
    const view = library?.view
    return {
      songs,
      artists: (view?.artists ?? []).filter(has).slice(0, 5),
      albums: (view?.albums ?? []).filter(has).slice(0, 5),
      playlists: [...(view?.made ?? []), ...(view?.playlists ?? [])].filter(has).slice(0, 5),
      message: null,
      savedAt: typeof library?.at === 'number' ? library.at : null
    }
  }

  orca.panels.handle('queue.get', async (): Promise<QueueView> => {
    try {
      const body = (await client.get('/me/player/queue')) as { currently_playing?: unknown; queue?: unknown } | null
      const now = trackRow(body?.currently_playing)
      const next = rows(body?.queue, trackRow).slice(0, 20)
      return { now, next, message: null }
    } catch (error) {
      return { now: null, next: [], message: apiDown(error) ? "The queue needs Spotify's API, which is paused right now. It comes back on its own." : message(error) }
    }
  })

  return { dispose: stopPending }
}

let running: { dispose(): void } | null = null

export default function activate(orca: OrcaWorkerApi): void {
  const run: RunFn = (file, args) =>
    new Promise((resolve, reject) => {
      execFile(file, args, { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)))
    })
  running = startWorker(orca, { fetch: fetch as unknown as FetchFn, now: () => Date.now(), listen: createServer, run, platform: process.platform })
}

export function deactivate(): void {
  running?.dispose()
  running = null
}
