import { assert, test } from 'orca/testing'
import { localArgs, localCommand, localPlay, LOCAL_STATE_SCRIPT, parseLocal } from './local'
import { parseCommand } from './spotify'

const S = '\u001f'
const line = (state: string, position = '57.46') =>
  ['spotify:track:0Ov9Hh2ygoGCkwTXMRYRcp', "Just Can't Be", 'The Flying Burrito Brothers', 'The Flying Burrito Brothers', 'https://i.scdn.co/image/ab67616d0000b27317ae', '284581', position, 'true', 'false', '64']
    .reduce((text, part) => text + S + part, state) + '\n'

test('the Mac app state parses into now playing', () => {
  const state = parseLocal(line('playing'))
  assert.ok(state && state.status === 'playing')
  assert.equal(state.now.trackId, '0Ov9Hh2ygoGCkwTXMRYRcp')
  assert.equal(state.now.name, "Just Can't Be")
  assert.equal(state.now.progressMs, 57460)
  assert.equal(state.now.durationMs, 284581)
  assert.equal(state.now.isPlaying, true)
  assert.equal(state.now.shuffle, true)
  assert.equal(state.now.repeat, 'off')
  assert.equal(state.now.cover, 'https://i.scdn.co/image/ab67616d0000b27317ae')
  assert.equal(state.volume, 64)
  assert.deepEqual(state.now.albumRef, { uri: null, id: null, name: 'The Flying Burrito Brothers', year: null, total: null, number: null, openUrl: null })
  const numbered = parseLocal(line('playing').replace('\n', S + '7\n'))
  assert.ok(numbered && numbered.status === 'playing')
  assert.equal(numbered.now.albumRef?.number, 7)
})

test('a comma decimal position (non-English macOS) still parses', () => {
  const state = parseLocal(line('paused', '57,5'))
  assert.ok(state && state.status === 'paused')
  assert.equal(state.now.progressMs, 57500)
  assert.equal(state.now.isPlaying, false)
})

test('off, stopped and junk are told apart', () => {
  assert.deepEqual(parseLocal('off\n'), { status: 'off' })
  assert.deepEqual(parseLocal('stopped'), { status: 'stopped' })
  assert.equal(parseLocal('playing'), null)
  assert.equal(parseLocal(line('buffering')), null)
})

test('an ad or episode has no track id but still shows', () => {
  const state = parseLocal(line('playing').replace('spotify:track:0Ov9Hh2ygoGCkwTXMRYRcp', 'spotify:ad:123'))
  assert.ok(state && state.status === 'playing')
  assert.equal(state.now.trackId, null)
})

test('transport commands go to the Mac app; the rest do not', () => {
  assert.deepEqual(localCommand({ action: 'next' }), ['-e', 'tell application "Spotify" to next track'])
  assert.deepEqual(localCommand({ action: 'seek', positionMs: 30_000 }), ['-e', 'tell application "Spotify" to set player position to 30.0'])
  assert.deepEqual(localCommand({ action: 'volume', percent: 140 }), ['-e', 'tell application "Spotify" to set sound volume to 100'])
  assert.deepEqual(localCommand({ action: 'repeat', mode: 'track' }), ['-e', 'tell application "Spotify" to set repeating to true'])
  assert.equal(localCommand({ action: 'playTrack', uri: 'spotify:track:x' }), null)
  assert.equal(localCommand({ action: 'transfer', deviceId: 'd' }), null)
  assert.equal(localCommand({ action: 'like', trackId: 'x', on: true }), null)
})

test('the state script never launches Spotify', () => {
  assert.equal(LOCAL_STATE_SCRIPT[0], 'if application "Spotify" is not running then return "off"')
  assert.equal(localArgs(['a', 'b']).join(' '), '-e a -e b')
})

test('playing through the Mac app keeps focus and plays inside the context', () => {
  const args = localPlay('spotify:track:t1', 'spotify:playlist:p1')
  assert.ok(args.includes('tell application "Spotify" to play track "spotify:track:t1" in context "spotify:playlist:p1"'))
  assert.equal(args.filter((arg) => arg === 'tell application prior to activate').length, 2)
  assert.ok(!args.includes('tell application "Spotify" to set shuffling to true'))
  const shuffled = localPlay('spotify:album:a1', undefined, true)
  assert.equal(shuffled.indexOf('tell application "Spotify" to set shuffling to true') < shuffled.indexOf('tell application "Spotify" to play track "spotify:album:a1"'), true)
})

test('openApp and music URIs are checked, and quotes never pass', () => {
  assert.deepEqual(parseCommand({ action: 'openApp' }), { action: 'openApp' })
  assert.deepEqual(localCommand({ action: 'openApp' }), ['-e', 'tell application "Spotify" to activate'])
  assert.deepEqual(parseCommand({ action: 'playContext', contextUri: 'music:album:0123456789ABCDEF' }), { action: 'playContext', contextUri: 'music:album:0123456789ABCDEF' })
  assert.deepEqual(parseCommand({ action: 'playContext', contextUri: 'music:album:0123456789ABCDEF', shuffle: true }), { action: 'playContext', contextUri: 'music:album:0123456789ABCDEF', shuffle: true })
  assert.deepEqual(parseCommand({ action: 'playContext', contextUri: 'music:album:0123456789ABCDEF', shuffle: 'yes' }), { action: 'playContext', contextUri: 'music:album:0123456789ABCDEF' })
  assert.equal(parseCommand({ action: 'playContext', contextUri: 'music:shell:0123456789ABCDEF' }), null)
  assert.equal(parseCommand({ action: 'playTrack', uri: 'music:track:A" & quit & "' }), null)
  assert.equal(parseCommand({ action: 'playTrack', uri: 'spotify:track:a" & quit & "' }), null)
})
