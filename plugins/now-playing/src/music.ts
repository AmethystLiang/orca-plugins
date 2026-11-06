import type { Command, Device, LibraryView, ListView, NowPlaying, RepeatMode, Row, SearchView } from './protocol'

const F = '\u001f'
const R = '\u001e'
export const TEMP_PLAYLIST = 'Now Playing (Orca)'
const PID = /^[A-F0-9]{16}$/
const LIST_MAX = 200

export const MUSIC_STATE_SCRIPT = [
  'if application "Music" is not running then return "off"',
  'tell application "Music"',
  'set s to player state as string',
  'set d to ASCII character 31',
  'if s is "stopped" then return "stopped" & d & ((sound volume) as string)',
  'try',
  'set t to current track',
  'set fav to "unknown"',
  'try',
  'set fav to (favorited of t) as string',
  'end try',
  'return s & d & (persistent ID of t) & d & (name of t) & d & (artist of t) & d & (album of t) & d & ((duration of t) as string) & d & ((player position) as string) & d & ((shuffle enabled) as string) & d & ((song repeat) as string) & d & ((sound volume) as string) & d & fav',
  'on error',
  'return "stopped" & d & ((sound volume) as string)',
  'end try',
  'end tell'
]

export const MUSIC_ARTWORK_SCRIPT = (path: string): string[] => [
  '-e', 'if application "Music" is not running then return "none"',
  '-e', 'tell application "Music"',
  '-e', 'try',
  '-e', 'set a to raw data of artwork 1 of current track',
  '-e', 'on error',
  '-e', 'return "none"',
  '-e', 'end try',
  '-e', 'end tell',
  '-e', `set f to open for access (POSIX file "${path}") with write permission`,
  '-e', 'set eof f to 0',
  '-e', 'write a to f',
  '-e', 'close access f',
  '-e', 'return "ok"'
]

export const ART = /^music-art:(t|p):([A-F0-9]{16})$/

export function musicArtScript(url: string, path: string): string[] | null {
  const match = ART.exec(url)
  if (!match) return null
  const target = match[1] === 't' ? `(first track of library playlist 1 whose persistent ID is "${match[2]}")` : `(track 1 of (first user playlist whose persistent ID is "${match[2]}"))`
  return [
    '-e', 'if application "Music" is not running then return "none"',
    '-e', 'tell application "Music"',
    '-e', 'try',
    '-e', `set a to raw data of artwork 1 of ${target}`,
    '-e', 'on error',
    '-e', 'return "none"',
    '-e', 'end try',
    '-e', 'end tell',
    '-e', `set f to open for access (POSIX file "${path}") with write permission`,
    '-e', 'set eof f to 0',
    '-e', 'write a to f',
    '-e', 'close access f',
    '-e', 'return "ok"'
  ]
}

export const MUSIC_LIBRARY_SCRIPT = [
  'if application "Music" is not running then return "off"',
  'tell application "Music"',
  'set d to ASCII character 31',
  'set r to ASCII character 30',
  'set L to library playlist 1',
  'set ids to persistent ID of every track of L',
  'set nm to name of every track of L',
  'set ar to artist of every track of L',
  'set al to album of every track of L',
  'set aa to album artist of every track of L',
  'set dn to disc number of every track of L',
  'set tn to track number of every track of L',
  'set db to database ID of every track of L',
  'set fv to {}',
  'try',
  'set fv to favorited of every track of L',
  'end try',
  'set AppleScript\'s text item delimiters to d',
  'set out to {(ids as text), (nm as text), (ar as text), (al as text), (aa as text), (dn as text), (tn as text), (db as text), (fv as text)}',
  'set pl to {}',
  'repeat with p in (every user playlist)',
  'try',
  'if (special kind of p) is none and name of p is not "' + TEMP_PLAYLIST + '" then set end of pl to (persistent ID of p) & d & (name of p) & d & ((count of tracks of p) as string)',
  'end try',
  'end repeat',
  'set AppleScript\'s text item delimiters to r',
  'set head to out as text',
  'set AppleScript\'s text item delimiters to (ASCII character 29)',
  'return head & (ASCII character 28) & (pl as text)',
  'end tell'
]

export const MUSIC_DEVICES_SCRIPT = [
  'if application "Music" is not running then return ""',
  'tell application "Music"',
  'set d to ASCII character 31',
  'set out to {}',
  'set i to 0',
  'repeat with a in (every AirPlay device)',
  'set i to i + 1',
  'try',
  'set end of out to (i as string) & d & (name of a) & d & ((kind of a) as string) & d & ((selected of a) as string) & d & ((sound volume of a) as string)',
  'end try',
  'end repeat',
  'set AppleScript\'s text item delimiters to (ASCII character 30)',
  'return out as text',
  'end tell'
]

export type MusicTrack = { id: string; name: string; artist: string; album: string; albumArtist: string; disc: number; number: number; added: number; favorite: boolean }
export type MusicPlaylist = { id: string; name: string; count: number }
export type MusicLibrary = { tracks: MusicTrack[]; playlists: MusicPlaylist[] }

export type MusicState = { status: 'off' } | { status: 'stopped'; volume: number | null } | { status: 'playing' | 'paused'; now: NowPlaying; volume: number | null }

const REPEATS: Record<string, RepeatMode> = { off: 'off', one: 'track', all: 'context' }

const number = (text: string): number => Number(text.trim().replace(',', '.'))

export function parseMusicState(stdout: string): MusicState | null {
  const text = stdout.replace(/\n$/, '')
  if (text === 'off') return { status: 'off' }
  const parts = text.split(F)
  if (parts[0] === 'stopped') {
    const volume = number(parts[1] ?? '')
    return { status: 'stopped', volume: parts.length === 2 && Number.isFinite(volume) ? volume : null }
  }
  if (parts.length !== 11) return null
  const [state, id, name, artist, album, duration, position, shuffle, repeat, volume, favorite] = parts
  if (state !== 'playing' && state !== 'paused') return null
  const durationS = number(duration)
  const positionS = number(position)
  const volumeN = number(volume)
  const trackId = PID.test(id) ? id : null
  return {
    status: state,
    volume: Number.isFinite(volumeN) ? volumeN : null,
    now: {
      trackId,
      uri: trackId ? `music:track:${trackId}` : null,
      name: name || 'Unknown',
      artists: artist,
      album,
      cover: null,
      durationMs: Number.isFinite(durationS) ? Math.round(durationS * 1000) : 0,
      progressMs: Number.isFinite(positionS) ? Math.round(positionS * 1000) : 0,
      isPlaying: state === 'playing',
      shuffle: shuffle === 'true',
      repeat: REPEATS[repeat] ?? 'off',
      liked: favorite === 'true' ? true : favorite === 'false' ? false : null,
      device: null,
      contextUri: null
    }
  }
}

export function parseMusicLibrary(stdout: string): MusicLibrary | null {
  const text = stdout.replace(/\n$/, '')
  if (text === 'off') return null
  const [head, lists = ''] = text.split('\u001c')
  const columns = head.split(R).map((column) => (column === '' ? [] : column.split(F)))
  if (columns.length !== 9) return null
  const [ids, names, artists, albums, albumArtists, discs, numbers, added, favorites] = columns
  const tracks: MusicTrack[] = []
  for (let i = 0; i < ids.length; i += 1) {
    if (!PID.test(ids[i])) continue
    tracks.push({
      id: ids[i],
      name: names[i] ?? '',
      artist: artists[i] ?? '',
      album: albums[i] ?? '',
      albumArtist: albumArtists[i] || artists[i] || '',
      disc: number(discs[i] ?? '0') || 0,
      number: number(numbers[i] ?? '0') || 0,
      added: number(added[i] ?? '0') || 0,
      favorite: favorites[i] === 'true'
    })
  }
  const playlists: MusicPlaylist[] = []
  for (const line of lists === '' ? [] : lists.split('\u001d')) {
    const [id, name, count] = line.split(F)
    if (PID.test(id) && name) playlists.push({ id, name, count: number(count ?? '0') || 0 })
  }
  return { tracks, playlists }
}

export function parseMusicDevices(stdout: string): Device[] {
  const text = stdout.replace(/\n$/, '')
  if (text === '') return []
  const list: Device[] = []
  for (const line of text.split(R)) {
    const [index, name, kind, selected, volume] = line.split(F)
    if (!/^\d+$/.test(index) || !name) continue
    const volumeN = number(volume ?? '')
    list.push({ id: `airplay:${index}`, name, type: /computer/i.test(kind ?? '') ? 'Computer' : 'Speaker', active: selected === 'true', volume: Number.isFinite(volumeN) ? volumeN : null })
  }
  return list
}

const quote = (text: string): string => `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`
const key = (album: string, artist: string): string => `${artist.toLowerCase()}${F}${album.toLowerCase()}`

const albumOrder = (a: MusicTrack, b: MusicTrack): number => a.disc - b.disc || a.number - b.number || a.name.localeCompare(b.name)

export function trackRowOf(track: MusicTrack): Row {
  return { kind: 'track', id: track.id, uri: `music:track:${track.id}`, name: track.name || 'Unknown', sub: [track.artist, track.album].filter(Boolean).join(' · '), cover: `music-art:t:${track.id}` }
}

function groups(tracks: MusicTrack[]): { albums: Map<string, MusicTrack[]>; artists: Map<string, MusicTrack[]> } {
  const albums = new Map<string, MusicTrack[]>()
  const artists = new Map<string, MusicTrack[]>()
  for (const track of tracks) {
    if (track.album) {
      const k = key(track.album, track.albumArtist)
      albums.set(k, [...(albums.get(k) ?? []), track])
    }
    const artist = track.albumArtist || track.artist
    if (artist) {
      const k = artist.toLowerCase()
      artists.set(k, [...(artists.get(k) ?? []), track])
    }
  }
  return { albums, artists }
}

function albumRow(list: MusicTrack[]): Row {
  const first = [...list].sort(albumOrder)[0]
  return { kind: 'album', id: first.id, uri: `music:album:${first.id}`, name: first.album, sub: `${first.albumArtist} · ${plural(list.length, 'song')}`, cover: `music-art:t:${first.id}` }
}

function artistRow(list: MusicTrack[]): Row {
  const first = list[0]
  return { kind: 'artist', id: first.id, uri: `music:artist:${first.id}`, name: first.albumArtist || first.artist, sub: plural(list.length, 'song'), cover: `music-art:t:${first.id}` }
}

export function musicLibraryView(library: MusicLibrary): LibraryView {
  const { albums, artists } = groups(library.tracks)
  const favorites = library.tracks.filter((track) => track.favorite).length
  const made: Row[] = [
    { kind: 'liked', id: 'liked', uri: 'music:liked:all', name: 'Favourite Songs', sub: plural(favorites, 'song'), cover: null },
    { kind: 'playlist', id: 'recent', uri: 'music:recent:all', name: 'Recently Added', sub: 'Your newest albums', cover: null }
  ]
  const albumRows = [...albums.values()].map(albumRow).sort((a, b) => a.name.localeCompare(b.name))
  const artistRows = [...artists.values()].map(artistRow).sort((a, b) => a.name.localeCompare(b.name))
  const playlists: Row[] = library.playlists.map((p) => ({ kind: 'playlist', id: p.id, uri: `music:playlist:${p.id}`, name: p.name, sub: plural(p.count, 'song'), cover: p.count > 0 ? `music-art:p:${p.id}` : null }))
  return { made, playlists, artists: artistRows, albums: albumRows, needsReauth: false, message: null, savedAt: null }
}

export function musicTracks(library: MusicLibrary, kind: string, id: string): ListView | null {
  const byId = library.tracks.find((track) => track.id === id)
  if (kind === 'liked') return { rows: library.tracks.filter((track) => track.favorite).slice(0, LIST_MAX).map(trackRowOf), message: null }
  if (kind === 'playlist' && id === 'recent') {
    const seen = new Set<string>()
    const rows: Row[] = []
    for (const track of [...library.tracks].sort((a, b) => b.added - a.added)) {
      const k = key(track.album, track.albumArtist)
      if (!track.album || seen.has(k)) continue
      seen.add(k)
      rows.push(albumRow(library.tracks.filter((other) => key(other.album, other.albumArtist) === k)))
      if (rows.length >= 30) break
    }
    return { rows, message: null }
  }
  if (!byId) return null
  if (kind === 'album') return { rows: albumTracks(library, byId).map(trackRowOf), message: null }
  if (kind === 'artist') return { rows: artistTracks(library, byId).slice(0, LIST_MAX).map(trackRowOf), message: null }
  return null
}

export function albumTracks(library: MusicLibrary, seed: MusicTrack): MusicTrack[] {
  const k = key(seed.album, seed.albumArtist)
  return library.tracks.filter((track) => key(track.album, track.albumArtist) === k).sort(albumOrder)
}

export function artistTracks(library: MusicLibrary, seed: MusicTrack): MusicTrack[] {
  const name = (seed.albumArtist || seed.artist).toLowerCase()
  return library.tracks.filter((track) => (track.albumArtist || track.artist).toLowerCase() === name).sort((a, b) => a.album.localeCompare(b.album) || albumOrder(a, b))
}

export function musicSearch(library: MusicLibrary, query: string): SearchView {
  const q = query.trim().toLowerCase()
  const view = musicLibraryView(library)
  const has = (text: string): boolean => text.toLowerCase().includes(q)
  return {
    songs: library.tracks.filter((track) => has(track.name) || has(track.artist)).slice(0, 8).map(trackRowOf),
    artists: view.artists.filter((row) => has(row.name)).slice(0, 5),
    albums: view.albums.filter((row) => has(row.name) || has(row.sub)).slice(0, 5),
    playlists: view.playlists.filter((row) => has(row.name)).slice(0, 5),
    message: null
  }
}

const tell = (line: string): string[] => ['-e', `tell application "Music" to ${line}`]

export function musicCommand(command: Command): string[] | null {
  switch (command.action) {
    case 'play':
      return tell('play')
    case 'pause':
      return tell('pause')
    case 'next':
      return tell('next track')
    case 'previous':
      return tell('previous track')
    case 'seek':
      return tell(`set player position to ${(Math.max(0, command.positionMs) / 1000).toFixed(1)}`)
    case 'shuffle':
      return tell(`set shuffle enabled to ${command.on}`)
    case 'repeat':
      return tell(`set song repeat to ${command.mode === 'off' ? 'off' : command.mode === 'track' ? 'one' : 'all'}`)
    case 'volume':
      return tell(`set sound volume to ${Math.min(100, Math.max(0, Math.round(command.percent)))}`)
    case 'like':
      return PID.test(command.trackId)
        ? ['-e', 'tell application "Music"', '-e', `if persistent ID of current track is ${quote(command.trackId)} then`, '-e', `set favorited of current track to ${command.on}`, '-e', 'else', '-e', `set favorited of (first track of library playlist 1 whose persistent ID is ${quote(command.trackId)}) to ${command.on}`, '-e', 'end if', '-e', 'end tell']
        : null
    case 'transfer': {
      const match = /^airplay:(\d{1,3})$/.exec(command.deviceId)
      return match ? tell(`set current AirPlay devices to {AirPlay device ${match[1]}}`) : null
    }
    case 'openApp':
      return tell('activate')
    default:
      return null
  }
}

const KEEP_FOCUS_AFTER = ['-e', 'delay 0.4', '-e', 'tell application prior to activate']

function playIds(ids: string[], start: number): string[] {
  const list = `{${ids.map(quote).join(', ')}}`
  return [
    '-e', 'set prior to path to frontmost application as text',
    '-e', 'tell application "Music"',
    '-e', `if not (exists user playlist ${quote(TEMP_PLAYLIST)}) then make new user playlist with properties {name:${quote(TEMP_PLAYLIST)}}`,
    '-e', `set p to user playlist ${quote(TEMP_PLAYLIST)}`,
    '-e', 'delete every track of p',
    '-e', `repeat with i in ${list}`,
    '-e', 'duplicate (first track of library playlist 1 whose persistent ID is (contents of i)) to p',
    '-e', 'end repeat',
    '-e', `play track ${start + 1} of p`,
    '-e', 'end tell',
    ...KEEP_FOCUS_AFTER
  ]
}

export function musicPlay(library: MusicLibrary | null, contextUri: string, offsetUri?: string): string[] | null {
  const [, kind, id] = contextUri.split(':')
  const offset = offsetUri?.split(':')[2]
  if (kind === 'playlist' && PID.test(id)) {
    const target = offset && PID.test(offset) ? `(first track of p whose persistent ID is ${quote(offset)})` : 'p'
    return ['-e', `tell application "Music"`, '-e', `set p to (first user playlist whose persistent ID is ${quote(id)})`, '-e', `play ${target}`, '-e', 'end tell']
  }
  if (kind === 'track' && PID.test(id)) return tell(`play (first track of library playlist 1 whose persistent ID is ${quote(id)})`)
  if (!library) return null
  const seed = library.tracks.find((track) => track.id === id)
  let tracks: MusicTrack[] = []
  if (kind === 'liked') tracks = library.tracks.filter((track) => track.favorite)
  else if (kind === 'album' && seed) tracks = albumTracks(library, seed)
  else if (kind === 'artist' && seed) tracks = artistTracks(library, seed)
  tracks = tracks.slice(0, LIST_MAX)
  if (tracks.length === 0) return null
  const start = Math.max(0, tracks.findIndex((track) => track.id === offset))
  return playIds(tracks.map((track) => track.id), start)
}
