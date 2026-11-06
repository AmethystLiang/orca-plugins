import type { Command, Device, NowPlaying, RepeatMode, Row } from './protocol'

export const REDIRECT_PORT = 8888
export const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`
export const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-library-modify',
  'user-follow-read',
  'user-read-recently-played'
]

export function base64url(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function authorizeUrl(clientId: string, challenge: string, state: string): string {
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES.join(' ')
  })
  return `https://accounts.spotify.com/authorize?${query.toString()}`
}

type Json = Record<string, unknown>

const obj = (value: unknown): Json | null => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null)
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export function pickImage(images: unknown): string | null {
  const list = arr(images)
    .map(obj)
    .filter((image): image is Json => image !== null && str(image.url) !== null)
  if (list.length === 0) return null
  const sized = list.filter((image) => (num(image.width) ?? 0) >= 64).sort((a, b) => (num(a.width) ?? 0) - (num(b.width) ?? 0))
  return str((sized[0] ?? list[list.length - 1]).url)
}

const names = (artists: unknown): string =>
  arr(artists)
    .map((artist) => str(obj(artist)?.name))
    .filter((name): name is string => name !== null)
    .join(', ')

export function parseDevice(value: unknown): Device | null {
  const device = obj(value)
  const id = str(device?.id)
  const name = str(device?.name)
  if (!device || !id || !name) return null
  return { id, name, type: str(device.type) ?? 'Computer', active: device.is_active === true, volume: num(device.volume_percent) }
}

export function parseDevices(value: unknown): Device[] {
  return arr(obj(value)?.devices)
    .map(parseDevice)
    .filter((device): device is Device => device !== null)
}

const REPEAT: Record<string, RepeatMode> = { off: 'off', context: 'context', track: 'track' }

export function parsePlayer(value: unknown): NowPlaying | null {
  const player = obj(value)
  const item = obj(player?.item)
  if (!player || !item) return null
  const isEpisode = item.type === 'episode'
  const album = obj(item.album)
  const show = obj(item.show)
  return {
    trackId: isEpisode ? null : str(item.id),
    uri: str(item.uri),
    name: str(item.name) ?? 'Unknown',
    artists: isEpisode ? (str(show?.name) ?? '') : names(item.artists),
    album: isEpisode ? (str(show?.publisher) ?? '') : (str(album?.name) ?? ''),
    cover: pickImage(isEpisode ? (item.images ?? show?.images) : album?.images),
    durationMs: num(item.duration_ms) ?? 0,
    progressMs: num(player.progress_ms) ?? 0,
    isPlaying: player.is_playing === true,
    shuffle: player.shuffle_state === true,
    repeat: REPEAT[str(player.repeat_state) ?? 'off'] ?? 'off',
    liked: null,
    device: parseDevice(player.device),
    contextUri: str(obj(player.context)?.uri)
  }
}

export function trackRow(value: unknown): Row | null {
  const track = obj(obj(value)?.track) ?? obj(obj(value)?.item) ?? obj(value)
  const id = str(track?.id)
  const uri = str(track?.uri)
  if (!track || !id || !uri) return null
  const isEpisode = track.type === 'episode'
  return {
    kind: 'track',
    id,
    uri,
    name: str(track.name) ?? 'Unknown',
    sub: isEpisode ? (str(obj(track.show)?.name) ?? 'Episode') : names(track.artists),
    cover: pickImage(isEpisode ? track.images : obj(track.album)?.images)
  }
}

export function artistRow(value: unknown): Row | null {
  const artist = obj(value)
  const id = str(artist?.id)
  const uri = str(artist?.uri)
  if (!artist || !id || !uri) return null
  return { kind: 'artist', id, uri, name: str(artist.name) ?? 'Unknown', sub: 'Artist', cover: pickImage(artist.images) }
}

export function albumRow(value: unknown): Row | null {
  const album = obj(value)
  const id = str(album?.id)
  const uri = str(album?.uri)
  if (!album || !id || !uri) return null
  return { kind: 'album', id, uri, name: str(album.name) ?? 'Unknown', sub: names(album.artists) || 'Album', cover: pickImage(album.images) }
}

export function playlistRow(value: unknown): Row | null {
  const playlist = obj(value)
  const id = str(playlist?.id)
  const uri = str(playlist?.uri)
  if (!playlist || !id || !uri) return null
  const owner = str(obj(playlist.owner)?.display_name) ?? 'Spotify'
  const total = num(obj(playlist.tracks)?.total) ?? num(obj(playlist.items)?.total)
  return {
    kind: 'playlist',
    id,
    uri,
    name: str(playlist.name) ?? 'Untitled',
    sub: total === null ? owner : `${owner} · ${total} ${total === 1 ? 'song' : 'songs'}`,
    cover: pickImage(playlist.images)
  }
}

export function rows<T>(values: unknown, parse: (value: unknown) => T | null): T[] {
  return arr(values)
    .map(parse)
    .filter((row): row is T => row !== null)
}

export function searchRows(value: unknown): { songs: Row[]; artists: Row[]; albums: Row[]; playlists: Row[] } {
  const body = obj(value)
  return {
    songs: rows(obj(body?.tracks)?.items, trackRow).slice(0, 5),
    artists: rows(obj(body?.artists)?.items, artistRow).slice(0, 3),
    albums: rows(obj(body?.albums)?.items, albumRow).slice(0, 3),
    playlists: rows(obj(body?.playlists)?.items, playlistRow).slice(0, 3)
  }
}

export type ApiCall = { method: 'GET' | 'PUT' | 'POST' | 'DELETE'; path: string; body?: Json }

const enc = encodeURIComponent

export function commandCall(command: Command, deviceId: string | null): ApiCall | null {
  const device = deviceId ? `device_id=${enc(deviceId)}` : ''
  const withDevice = (path: string): string => (device ? `${path}${path.includes('?') ? '&' : '?'}${device}` : path)
  switch (command.action) {
    case 'play':
      return { method: 'PUT', path: withDevice('/me/player/play') }
    case 'pause':
      return { method: 'PUT', path: withDevice('/me/player/pause') }
    case 'next':
      return { method: 'POST', path: withDevice('/me/player/next') }
    case 'previous':
      return { method: 'POST', path: withDevice('/me/player/previous') }
    case 'seek':
      return { method: 'PUT', path: withDevice(`/me/player/seek?position_ms=${Math.max(0, Math.round(command.positionMs))}`) }
    case 'shuffle':
      return { method: 'PUT', path: withDevice(`/me/player/shuffle?state=${command.on}`) }
    case 'repeat':
      return { method: 'PUT', path: withDevice(`/me/player/repeat?state=${command.mode}`) }
    case 'volume':
      return { method: 'PUT', path: withDevice(`/me/player/volume?volume_percent=${Math.min(100, Math.max(0, Math.round(command.percent)))}`) }
    case 'transfer':
      return { method: 'PUT', path: '/me/player', body: { device_ids: [command.deviceId], play: true } }
    case 'like':
      return { method: command.on ? 'PUT' : 'DELETE', path: `/me/tracks?ids=${enc(command.trackId)}` }
    case 'playContext':
      return {
        method: 'PUT',
        path: withDevice('/me/player/play'),
        body: command.offsetUri ? { context_uri: command.contextUri, offset: { uri: command.offsetUri } } : { context_uri: command.contextUri }
      }
    case 'playTrack':
      return { method: 'PUT', path: withDevice('/me/player/play'), body: { uris: [command.uri] } }
    case 'dj':
      return null
    case 'queue':
      return { method: 'POST', path: withDevice(`/me/player/queue?uri=${enc(command.uri)}`) }
  }
  return null
}

const ACTIONS = new Set(['play', 'pause', 'next', 'previous', 'seek', 'shuffle', 'repeat', 'volume', 'transfer', 'like', 'playContext', 'playTrack', 'queue', 'dj'])
const URI = /^spotify(:[A-Za-z0-9._-]{1,64}){2,4}$/
const ID = /^[A-Za-z0-9]{1,64}$/

export function parseCommand(input: unknown): Command | null {
  const value = obj(input)
  const action = str(value?.action)
  if (!value || !action || !ACTIONS.has(action)) return null
  const uri = (key: string): string | null => {
    const text = str(value[key])
    return text !== null && URI.test(text) ? text : null
  }
  const id = (key: string): string | null => {
    const text = str(value[key])
    return text !== null && ID.test(text) ? text : null
  }
  switch (action) {
    case 'seek': {
      const positionMs = num(value.positionMs)
      return positionMs === null ? null : { action, positionMs }
    }
    case 'shuffle':
      return typeof value.on === 'boolean' ? { action, on: value.on } : null
    case 'repeat': {
      const mode = REPEAT[str(value.mode) ?? '']
      return mode ? { action, mode } : null
    }
    case 'volume': {
      const percent = num(value.percent)
      return percent === null ? null : { action, percent }
    }
    case 'transfer': {
      const deviceId = str(value.deviceId)
      return deviceId !== null && deviceId.length <= 128 ? { action, deviceId } : null
    }
    case 'like': {
      const trackId = id('trackId')
      return trackId && typeof value.on === 'boolean' ? { action, trackId, on: value.on } : null
    }
    case 'playContext': {
      const contextUri = uri('contextUri')
      if (!contextUri) return null
      const offsetUri = uri('offsetUri')
      return offsetUri ? { action, contextUri, offsetUri } : { action, contextUri }
    }
    case 'playTrack':
    case 'queue': {
      const target = uri('uri')
      return target ? { action, uri: target } : null
    }
    default:
      return { action } as Command
  }
}

export function apiErrorMessage(status: number, body: unknown): string {
  const error = obj(obj(body)?.error)
  const reason = str(error?.reason)
  if (reason === 'NO_ACTIVE_DEVICE' || (status === 404 && /device/i.test(str(error?.message) ?? ''))) return 'No device is open. Open Spotify on your Mac or phone.'
  if (reason === 'PREMIUM_REQUIRED') return 'Spotify says this needs Premium.'
  if (status === 429) return 'Spotify asked us to slow down. Try again in a moment.'
  if (status === 401) return 'Spotify sign-in expired. Sign in again.'
  if (status === 403) return 'Spotify did not allow that.'
  if (status === 404) return 'Spotify could not find that.'
  return `Spotify answered ${status}.`
}

export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}


export const DJ_URI = 'spotify:playlist:37i9dQZF1EYkqdzj48dyYq'
const DAYLIST = /^spotify:playlist:37i9dQZF1EP[A-Za-z0-9]+$/

export function daylistUri(recent: unknown): string | null {
  for (const item of arr(obj(recent)?.items)) {
    const uri = str(obj(obj(item)?.context)?.uri)
    if (uri && DAYLIST.test(uri)) return uri
  }
  return null
}

export function savedAlbumRows(body: unknown): Row[] {
  return rows(obj(body)?.items, (item) => albumRow(obj(item)?.album))
}

export function followedArtistRows(body: unknown): Row[] {
  return rows(obj(obj(body)?.artists)?.items, artistRow)
}
