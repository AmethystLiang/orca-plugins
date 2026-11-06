import type { Command, NowPlaying } from './protocol'

const SEP = '\u001f'

export const LOCAL_STATE_SCRIPT = [
  'if application "Spotify" is not running then return "off"',
  'tell application "Spotify"',
  'set s to player state as string',
  'if s is "stopped" then return "stopped"',
  'set t to current track',
  `set d to ASCII character 31`,
  'return s & d & (id of t) & d & (name of t) & d & (artist of t) & d & (album of t) & d & (artwork url of t) & d & (duration of t) & d & (player position) & d & (shuffling) & d & (repeating) & d & (sound volume)',
  'end tell'
]

export function localArgs(lines: readonly string[]): string[] {
  return lines.flatMap((line) => ['-e', line])
}

export type LocalState = { status: 'off' | 'stopped' } | { status: 'playing' | 'paused'; now: NowPlaying; volume: number | null }

export function parseLocal(stdout: string): LocalState | null {
  const text = stdout.trim()
  if (text === 'off' || text === 'stopped') return { status: text }
  const parts = text.split(SEP)
  if (parts.length !== 11) return null
  const [state, uri, name, artist, album, artwork, duration, position, shuffle, repeat, volume] = parts
  if (state !== 'playing' && state !== 'paused') return null
  const match = /^spotify:track:([A-Za-z0-9]{1,64})$/.exec(uri)
  const durationMs = Number(duration)
  const positionS = Number(position.replace(',', '.'))
  const volumeN = Number(volume)
  return {
    status: state,
    volume: Number.isFinite(volumeN) ? volumeN : null,
    now: {
      trackId: match ? match[1] : null,
      uri: uri.startsWith('spotify:') ? uri : null,
      name: name || 'Unknown',
      artists: artist,
      album,
      cover: artwork.startsWith('https://') ? artwork : null,
      durationMs: Number.isFinite(durationMs) ? durationMs : 0,
      progressMs: Number.isFinite(positionS) ? Math.round(positionS * 1000) : 0,
      isPlaying: state === 'playing',
      shuffle: shuffle === 'true',
      repeat: repeat === 'true' ? 'context' : 'off',
      liked: null,
      device: null,
      contextUri: null
    }
  }
}

export function localCommand(command: Command): string[] | null {
  const tell = (line: string): string[] => ['-e', `tell application "Spotify" to ${line}`]
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
      return tell(`set shuffling to ${command.on}`)
    case 'repeat':
      return tell(`set repeating to ${command.mode !== 'off'}`)
    case 'volume':
      return tell(`set sound volume to ${Math.min(100, Math.max(0, Math.round(command.percent)))}`)
    case 'openApp':
      return tell('activate')
    default:
      return null
  }
}

const KEEP_FOCUS_AFTER = ['-e', 'delay 0.4', '-e', 'tell application prior to activate', '-e', 'delay 0.8', '-e', 'tell application prior to activate']

export function localPlay(uri: string, context?: string): string[] {
  const play = context ? `play track "${uri}" in context "${context}"` : `play track "${uri}"`
  return ['-e', 'set prior to path to frontmost application as text', '-e', `tell application "Spotify" to ${play}`, ...KEEP_FOCUS_AFTER]
}
