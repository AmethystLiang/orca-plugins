import { assert, test } from 'orca/testing'
import { musicCommand, musicLibraryView, musicPlay, musicSearch, musicTracks, parseMusicDevices, parseMusicLibrary, parseMusicState, TEMP_PLAYLIST } from './music'

const F = '\u001f'
const R = '\u001e'
const A = '0123456789ABCDEF'
const B = 'FEDCBA9876543210'
const C = 'AAAAAAAAAAAAAAAA'

const state = (head: string, favorite = 'true') => [head, A, 'Slow Boat Home', 'The Westport Lights', 'River City', '238,5', '72.25', 'false', 'all', '55', favorite].join(F) + '\n'

const libraryText = () => {
  const columns = [
    [A, B, C],
    ['Slow Boat Home', 'Harbor', 'Fiddle Reel'],
    ['The Westport Lights', 'The Westport Lights', 'Hale'],
    ['River City', 'River City', 'Porch Tunes'],
    ['The Westport Lights', '', 'Hale'],
    ['1', '1', '1'],
    ['2', '1', '1'],
    ['10', '11', '30'],
    ['true', 'false', 'true']
  ].map((column) => column.join(F))
  const playlists = [`${C}${F}Sunday Porch${F}42`, `bad${F}Nope${F}1`].join('\u001d')
  return columns.join(R) + '\u001c' + playlists + '\n'
}

test('the Music app state parses, including a comma duration and favourites', () => {
  const parsed = parseMusicState(state('playing'))
  assert.ok(parsed && parsed.status === 'playing')
  assert.equal(parsed.now.trackId, A)
  assert.equal(parsed.now.uri, `music:track:${A}`)
  assert.equal(parsed.now.durationMs, 238500)
  assert.equal(parsed.now.progressMs, 72250)
  assert.equal(parsed.now.repeat, 'context')
  assert.equal(parsed.now.liked, true)
  assert.equal(parsed.volume, 55)
  assert.equal(parseMusicState(state('paused', 'unknown'))?.status, 'paused')
  const unknown = parseMusicState(state('paused', 'unknown'))
  assert.ok(unknown && unknown.status === 'paused' && unknown.now.liked === null)
})

test('off, stopped and junk are told apart', () => {
  assert.deepEqual(parseMusicState('off\n'), { status: 'off' })
  assert.deepEqual(parseMusicState('stopped'), { status: 'stopped', volume: null })
  assert.deepEqual(parseMusicState(`stopped${F}40`), { status: 'stopped', volume: 40 })
  assert.equal(parseMusicState(state('fast forwarding')), null)
  assert.equal(parseMusicState('playing'), null)
})

test('the library groups into albums, artists, favourites and playlists', () => {
  const library = parseMusicLibrary(libraryText())
  assert.ok(library)
  assert.equal(library.tracks.length, 3)
  assert.equal(library.tracks[1].albumArtist, 'The Westport Lights')
  assert.deepEqual(library.playlists, [{ id: C, name: 'Sunday Porch', count: 42 }])
  const view = musicLibraryView(library)
  assert.equal(view.made[0].name, 'Favourite Songs')
  assert.equal(view.made[0].sub, '2 songs')
  assert.deepEqual(view.albums.map((row) => row.name), ['Porch Tunes', 'River City'])
  assert.equal(view.albums[1].uri, `music:album:${B}`)
  assert.deepEqual(view.artists.map((row) => row.name), ['Hale', 'The Westport Lights'])
  assert.equal(view.playlists[0].uri, `music:playlist:${C}`)
})

test('album tracks play in disc and track order, and recently added lists newest albums', () => {
  const library = parseMusicLibrary(libraryText())
  assert.ok(library)
  assert.deepEqual(musicTracks(library, 'album', A)?.rows.map((row) => row.name), ['Harbor', 'Slow Boat Home'])
  assert.deepEqual(musicTracks(library, 'playlist', 'recent')?.rows.map((row) => row.name), ['Porch Tunes', 'River City'])
  assert.deepEqual(musicTracks(library, 'liked', 'liked')?.rows.map((row) => row.name), ['Slow Boat Home', 'Fiddle Reel'])
  assert.equal(musicTracks(library, 'album', 'ZZZZZZZZZZZZZZZZ'), null)
})

test('search looks at songs, artists, albums and playlists', () => {
  const library = parseMusicLibrary(libraryText())
  assert.ok(library)
  const found = musicSearch(library, 'porch')
  assert.deepEqual(found.albums.map((row) => row.name), ['Porch Tunes'])
  assert.deepEqual(found.playlists.map((row) => row.name), ['Sunday Porch'])
  assert.deepEqual(musicSearch(library, 'harbor').songs.map((row) => row.name), ['Harbor'])
})

test('albums play through the reusable playlist, starting at the picked song', () => {
  const library = parseMusicLibrary(libraryText())
  const args = musicPlay(library, `music:album:${A}`, `music:track:${A}`)
  assert.ok(args)
  const text = args.join(' ')
  assert.ok(text.includes(`user playlist "${TEMP_PLAYLIST}"`))
  assert.ok(text.includes(`{"${B}", "${A}"}`))
  assert.ok(text.includes('play track 2 of p'))
  assert.ok(musicPlay(null, `music:playlist:${C}`)?.join(' ').includes(`persistent ID is "${C}"`))
  assert.equal(musicPlay(null, `music:album:${A}`), null)
})

test('Music commands map, and bad ids never reach AppleScript', () => {
  assert.deepEqual(musicCommand({ action: 'repeat', mode: 'track' }), ['-e', 'tell application "Music" to set song repeat to one'])
  assert.deepEqual(musicCommand({ action: 'openApp' }), ['-e', 'tell application "Music" to activate'])
  assert.deepEqual(musicCommand({ action: 'transfer', deviceId: 'airplay:2' }), ['-e', 'tell application "Music" to set current AirPlay devices to {AirPlay device 2}'])
  assert.equal(musicCommand({ action: 'transfer', deviceId: 'airplay:2} & quit & {' }), null)
  assert.equal(musicCommand({ action: 'like', trackId: 'abc', on: true }), null)
  assert.ok(musicCommand({ action: 'like', trackId: A, on: false })?.join(' ').includes(`if persistent ID of current track is "${A}" then -e set favorited of current track to false`))
  assert.equal(musicCommand({ action: 'dj' }), null)
})

test('AirPlay devices parse with the selected one active', () => {
  const list = parseMusicDevices([`1${F}Computer${F}computer${F}true${F}100`, `2${F}Kitchen${F}HomePod${F}false${F}40`].join(R) + '\n')
  assert.deepEqual(list.map((device) => [device.id, device.name, device.type, device.active]), [['airplay:1', 'Computer', 'Computer', true], ['airplay:2', 'Kitchen', 'Speaker', false]])
  assert.deepEqual(parseMusicDevices(''), [])
})
