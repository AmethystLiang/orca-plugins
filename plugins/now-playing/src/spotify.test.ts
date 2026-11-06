import { assert, test } from 'orca/testing'
import { apiErrorMessage, authorizeUrl, clock, commandCall, parseCommand, parseDevices, parsePlayer, pickImage, playlistRow, searchRows, trackRow } from './spotify'

const track = {
  type: 'track',
  id: 'abc123',
  uri: 'spotify:track:abc123',
  name: 'Holocene',
  duration_ms: 336000,
  artists: [{ name: 'Bon Iver' }, { name: 'Guest' }],
  album: { name: 'Bon Iver, Bon Iver', images: [{ url: 'https://i.scdn.co/640', width: 640 }, { url: 'https://i.scdn.co/300', width: 300 }, { url: 'https://i.scdn.co/64', width: 64 }] }
}

test('the player answer maps to now playing', () => {
  const now = parsePlayer({
    is_playing: true,
    progress_ms: 1000,
    shuffle_state: true,
    repeat_state: 'track',
    item: track,
    device: { id: 'd1', name: "My Laptop", type: 'Computer', is_active: true, volume_percent: 64 },
    context: { uri: 'spotify:playlist:p1' }
  })
  assert.deepEqual(now, {
    trackId: 'abc123',
    uri: 'spotify:track:abc123',
    name: 'Holocene',
    artists: 'Bon Iver, Guest',
    album: 'Bon Iver, Bon Iver',
    cover: 'https://i.scdn.co/64',
    durationMs: 336000,
    progressMs: 1000,
    isPlaying: true,
    shuffle: true,
    repeat: 'track',
    liked: null,
    device: { id: 'd1', name: "My Laptop", type: 'Computer', active: true, volume: 64 },
    contextUri: 'spotify:playlist:p1'
  })
})

test('nothing playing (204 body null, or no item) is null', () => {
  assert.equal(parsePlayer(null), null)
  assert.equal(parsePlayer({ is_playing: false, item: null }), null)
})

test('an unknown repeat state reads as off', () => {
  assert.equal(parsePlayer({ item: track, repeat_state: 'weird' })?.repeat, 'off')
})

test('pickImage takes the smallest image at least 64 wide, else the last one', () => {
  assert.equal(pickImage(track.album.images), 'https://i.scdn.co/64')
  assert.equal(pickImage([{ url: 'https://i.scdn.co/a', width: 40 }, { url: 'https://i.scdn.co/b', width: 30 }]), 'https://i.scdn.co/b')
  assert.equal(pickImage([{ url: 'https://i.scdn.co/a' }]), 'https://i.scdn.co/a')
  assert.equal(pickImage([]), null)
  assert.equal(pickImage('nope'), null)
})

test('devices drop entries with no id', () => {
  assert.deepEqual(parseDevices({ devices: [{ id: null, name: 'Ghost' }, { id: 'd2', name: 'Phone', type: 'Smartphone', is_active: false, volume_percent: null }] }), [
    { id: 'd2', name: 'Phone', type: 'Smartphone', active: false, volume: null }
  ])
})

test('playlist rows read the song count from tracks or items', () => {
  assert.equal(playlistRow({ id: 'p1', uri: 'spotify:playlist:p1', name: 'Coding late', owner: { display_name: 'Sam' }, tracks: { total: 64 } })?.sub, 'Sam · 64 songs')
  assert.equal(playlistRow({ id: 'p2', uri: 'spotify:playlist:p2', name: 'One', owner: { display_name: 'Sam' }, items: { total: 1 } })?.sub, 'Sam · 1 song')
  assert.equal(playlistRow({ id: 'p3', uri: 'spotify:playlist:p3', name: 'X' })?.sub, 'Spotify')
})

test('track rows unwrap playlist items and skip local files with no id', () => {
  assert.equal(trackRow({ track })?.name, 'Holocene')
  assert.equal(trackRow({ item: track })?.name, 'Holocene')
  assert.equal(trackRow({ track: { name: 'local file', id: null, uri: 'spotify:local:x' } }), null)
})

test('search keeps at most 5 songs and 3 of the rest, and skips null items', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...track, id: `t${i}`, uri: `spotify:track:t${i}` }))
  const found = searchRows({ tracks: { items: many(8) }, playlists: { items: [null, { id: 'p', uri: 'spotify:playlist:p', name: 'P' }] } })
  assert.equal(found.songs.length, 5)
  assert.equal(found.playlists.length, 1)
  assert.equal(found.artists.length, 0)
})

test('commands map to the right Spotify calls', () => {
  assert.deepEqual(commandCall({ action: 'pause' }, null), { method: 'PUT', path: '/me/player/pause' })
  assert.deepEqual(commandCall({ action: 'play' }, 'dev 1'), { method: 'PUT', path: '/me/player/play?device_id=dev%201' })
  assert.deepEqual(commandCall({ action: 'seek', positionMs: -5 }, null), { method: 'PUT', path: '/me/player/seek?position_ms=0' })
  assert.deepEqual(commandCall({ action: 'volume', percent: 140 }, 'd'), { method: 'PUT', path: '/me/player/volume?volume_percent=100&device_id=d' })
  assert.deepEqual(commandCall({ action: 'like', trackId: 'abc', on: false }, null), { method: 'DELETE', path: '/me/tracks?ids=abc' })
  assert.deepEqual(commandCall({ action: 'transfer', deviceId: 'd2' }, null), { method: 'PUT', path: '/me/player', body: { device_ids: ['d2'], play: true } })
  assert.deepEqual(commandCall({ action: 'playContext', contextUri: 'spotify:playlist:p', offsetUri: 'spotify:track:t' }, null), {
    method: 'PUT',
    path: '/me/player/play',
    body: { context_uri: 'spotify:playlist:p', offset: { uri: 'spotify:track:t' } }
  })
  assert.deepEqual(commandCall({ action: 'queue', uri: 'spotify:track:t' }, null), { method: 'POST', path: '/me/player/queue?uri=spotify%3Atrack%3At' })
})

test('parseCommand accepts good input and refuses bad input', () => {
  assert.deepEqual(parseCommand({ action: 'next' }), { action: 'next' })
  assert.deepEqual(parseCommand({ action: 'repeat', mode: 'context' }), { action: 'repeat', mode: 'context' })
  assert.deepEqual(parseCommand({ action: 'playContext', contextUri: 'spotify:user:sam:collection' }), { action: 'playContext', contextUri: 'spotify:user:sam:collection' })
  assert.equal(parseCommand({ action: 'rm -rf' }), null)
  assert.equal(parseCommand({ action: 'repeat', mode: 'forever' }), null)
  assert.equal(parseCommand({ action: 'playTrack', uri: 'https://evil.example/x' }), null)
  assert.equal(parseCommand({ action: 'queue', uri: 'spotify:track:a/../b' }), null)
  assert.equal(parseCommand({ action: 'like', trackId: 'a b', on: true }), null)
  assert.equal(parseCommand({ action: 'seek' }), null)
  assert.equal(parseCommand(null), null)
})

test('the sign-in URL carries PKCE, the loopback redirect and the scopes', () => {
  const url = new URL(authorizeUrl('cid', 'chal', 'st'))
  assert.equal(url.origin, 'https://accounts.spotify.com')
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('code_challenge'), 'chal')
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8888/callback')
  assert.ok(url.searchParams.get('scope')?.includes('user-modify-playback-state'))
})

test('error messages name the fix', () => {
  assert.equal(apiErrorMessage(404, { error: { status: 404, message: 'Player command failed: No active device found', reason: 'NO_ACTIVE_DEVICE' } }), 'No device is open. Open Spotify on your Mac or phone.')
  assert.equal(apiErrorMessage(429, null), 'Spotify asked us to slow down. Try again in a moment.')
  assert.equal(apiErrorMessage(500, null), 'Spotify answered 500.')
})

test('clock formats minutes and seconds', () => {
  assert.equal(clock(336000), '5:36')
  assert.equal(clock(5000), '0:05')
  assert.equal(clock(-1), '0:00')
})
