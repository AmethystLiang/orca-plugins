export type RepeatMode = 'off' | 'context' | 'track'

export type Device = { id: string; name: string; type: string; active: boolean; volume: number | null }

export type NowPlaying = {
  trackId: string | null
  uri: string | null
  name: string
  artists: string
  album: string
  cover: string | null
  durationMs: number
  progressMs: number
  isPlaying: boolean
  shuffle: boolean
  repeat: RepeatMode
  liked: boolean | null
  device: Device | null
  contextUri: string | null
}

export type Row = {
  kind: 'track' | 'artist' | 'album' | 'playlist'
  id: string
  uri: string
  name: string
  sub: string
  cover: string | null
}

export type PlayerView =
  | { status: 'signedOut'; message: string | null; needsClientId: boolean }
  | { status: 'ok'; now: NowPlaying | null; devices: Device[]; checkedAt: number }
  | { status: 'error'; message: string }

export type ListView = { rows: Row[]; message: string | null }

export type SearchView = { songs: Row[]; artists: Row[]; albums: Row[]; playlists: Row[]; message: string | null }

export type QueueView = { now: Row | null; next: Row[]; message: string | null }

export type Command =
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; positionMs: number }
  | { action: 'shuffle'; on: boolean }
  | { action: 'repeat'; mode: RepeatMode }
  | { action: 'volume'; percent: number }
  | { action: 'transfer'; deviceId: string }
  | { action: 'like'; trackId: string; on: boolean }
  | { action: 'playContext'; contextUri: string; offsetUri?: string }
  | { action: 'playTrack'; uri: string }
  | { action: 'queue'; uri: string }

export type CommandResult = { ok: true } | { ok: false; message: string }

export type AuthStart = { url: string } | { error: string }
