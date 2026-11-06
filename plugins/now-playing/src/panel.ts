import { PANEL_CSS } from './panel-css'
import type { AuthStart, Command, CommandResult, Device, ListView, NowPlaying, PlayerView, QueueView, Row, SearchView } from './protocol'
import { clock } from './spotify'

const ICONS: Record<string, string> = {
  play: '<polygon points="7 4 20 12 7 20 7 4" fill="black"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="black"/><rect x="14" y="4" width="4" height="16" fill="black"/>',
  prev: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>',
  next: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>',
  shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  repeat1: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  speaker: '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><line x1="12" y1="6" x2="12.01" y2="6"/>',
  laptop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  vol: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  heartFull: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" fill="black"/>',
  addq: '<path d="M3 6h13M3 12h13M3 18h9"/><path d="M19 15v6M16 18h6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  chev: '<polyline points="6 9 12 15 18 9"/>',
  back: '<polyline points="15 18 9 12 15 6"/>'
}

const ICON_CSS = Object.entries(ICONS)
  .map(([name, body]) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    return `.i-${name}{-webkit-mask-image:${url};mask-image:${url}}`
  })
  .join('\n')

type Tab = 'search' | 'playlists' | 'queue'
const POLL_MS = 3000
const TAB_KEY = 'tab'

type Frame = {
  plugin: { request(name: string, input?: unknown): Promise<unknown>; on(event: string, handler: (payload: unknown) => void): { dispose(): void } }
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> }
  settings: { set(key: string, value: unknown): Promise<void> }
  host: { call(method: string, params?: unknown): Promise<unknown>; has(method: string): boolean }
  shell?: { openExternal(url: string): Promise<{ opened: boolean }> }
}

const orca = (globalThis as unknown as { orca: Frame }).orca

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function icon(name: string): HTMLSpanElement {
  return el('span', `ic i-${name}`)
}

function iconButton(name: string, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const button = el('button', `btn ${cls}`.trim())
  button.title = label
  button.setAttribute('aria-label', label)
  button.appendChild(icon(name))
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return button
}

function art(src: string | null, round = false): HTMLElement {
  if (src && src.startsWith('data:image/')) {
    const img = el('img', `art${round ? ' round' : ''}`)
    img.src = src
    img.alt = ''
    return img
  }
  return el('span', `art${round ? ' round' : ''}`)
}

const style = el('style')
style.textContent = PANEL_CSS + ICON_CSS
document.head.appendChild(style)

const app = el('div', 'app')
document.body.appendChild(app)

let view: PlayerView | null = null
let viewAt = 0
let tab: Tab = 'playlists'
let playlists: ListView | null = null
let opened: { row: Row; list: ListView | null } | null = null
let query = ''
let search: SearchView | null = null
let queue: QueueView | null = null
let devOpen = false
let toastTimer: ReturnType<typeof setTimeout> | null = null
let lastCover: string | null = null

const playerBox = el('div', 'player')
const tabsBox = el('div', 'tabs')
const searchBox = el('div', 'searchbox')
const searchInput = el('input')
const listBox = el('div', 'list')
const footBox = el('div', 'foot')
const toastBox = el('div', 'toast')
const popBox = el('div', 'pop')
searchInput.placeholder = 'Search songs, artists, albums, playlists'
searchInput.setAttribute('aria-label', 'Search Spotify')
searchBox.append(icon('search'), searchInput)

function toast(text: string): void {
  toastBox.textContent = text
  if (!toastBox.isConnected) app.appendChild(toastBox)
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastBox.remove(), 4000)
}

async function request<T>(name: string, input?: unknown): Promise<T | null> {
  try {
    return (await orca.plugin.request(name, input)) as T
  } catch {
    toast('The Spotify worker did not answer. Try again.')
    return null
  }
}

async function send(command: Command): Promise<boolean> {
  const result = await request<CommandResult>('command', command)
  if (result && !result.ok) toast(result.message)
  setTimeout(() => void refresh(), 350)
  setTimeout(() => void refresh(), 1400)
  return result?.ok === true
}

function now(): NowPlaying | null {
  return view?.status === 'ok' ? view.now : null
}

function progressMs(): number {
  const playing = now()
  if (!playing) return 0
  const moved = playing.isPlaying ? Date.now() - viewAt : 0
  return Math.min(playing.durationMs, playing.progressMs + moved)
}

function setTint(src: string | null): void {
  if (src === lastCover) return
  lastCover = src
  if (!src) {
    playerBox.style.removeProperty('--tint')
    return
  }
  const img = new Image()
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 8
      canvas.height = 8
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, 8, 8)
      const data = ctx.getImageData(0, 0, 8, 8).data
      let r = 0
      let g = 0
      let b = 0
      let weight = 0
      for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2])
        const min = Math.min(data[i], data[i + 1], data[i + 2])
        const w = 1 + (max - min) / 32
        r += data[i] * w
        g += data[i + 1] * w
        b += data[i + 2] * w
        weight += w
      }
      const alpha = getComputedStyle(document.documentElement).getPropertyValue('--sp-tint-alpha').trim() || '0.3'
      const tint = `rgba(${Math.round(r / weight)}, ${Math.round(g / weight)}, ${Math.round(b / weight)}, ${alpha})`
      playerBox.style.setProperty('--tint', tint)
    } catch {
      playerBox.style.removeProperty('--tint')
    }
  }
  img.src = src
}

function deviceIcon(device: Device): string {
  if (/smartphone|tablet/i.test(device.type)) return 'phone'
  if (/computer/i.test(device.type)) return 'laptop'
  return 'speaker'
}

const SETUP_STEPS = [
  'Open developer.spotify.com/dashboard and click Create app.',
  'Redirect URI: http://127.0.0.1:8888/callback (click Add).',
  'Tick Web API, accept the terms and Save.',
  'Copy the Client ID from Settings and paste it below.'
]

function renderSetup(box: HTMLElement): void {
  box.append(el('div', 'b', 'One-time setup'), el('div', 'm sm', 'Spotify needs an app of your own (free, about 2 minutes, Premium account).'))
  const steps = el('ol', 'sm steps')
  for (const step of SETUP_STEPS) steps.appendChild(el('li', '', step))
  const open = el('button', 'link', 'Open the Spotify dashboard')
  open.addEventListener('click', () => void openUrl('https://developer.spotify.com/dashboard'))
  const input = el('input', 'field')
  input.placeholder = 'Client ID (32 characters)'
  input.setAttribute('aria-label', 'Spotify Client ID')
  const save = el('button', 'cta', 'Save Client ID')
  const submit = async (): Promise<void> => {
    const value = input.value.trim()
    if (!/^[A-Za-z0-9]{20,64}$/.test(value)) return toast('That does not look like a Client ID. It is 32 letters and numbers.')
    try {
      await orca.settings.set('clientId', value)
    } catch {
      return toast('Could not save the Client ID.')
    }
    await refresh()
  }
  save.addEventListener('click', () => void submit())
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void submit()
  })
  box.append(steps, open, input, save)
}

async function openUrl(url: string): Promise<boolean> {
  try {
    if (orca.shell) return (await orca.shell.openExternal(url)).opened
    return ((await orca.host.call('shell.openExternal', { url })) as { opened: boolean }).opened
  } catch {
    return false
  }
}

function renderSignedOut(text: string | null, needsClientId: boolean): void {
  app.replaceChildren()
  const box = el('div', 'center')
  const logo = icon('music')
  logo.style.width = '36px'
  logo.style.height = '36px'
  logo.classList.add('m')
  if (needsClientId) {
    box.appendChild(logo)
    renderSetup(box)
    app.appendChild(box)
    return
  }
  const button = el('button', 'cta', 'Sign in with Spotify')
  button.addEventListener('click', () => void signIn(box))
  box.append(logo, el('div', '', 'Control Spotify from Orca.'), button, el('div', 'm sm', 'Opens Spotify in your browser once. You stay signed in.'))
  if (text) box.appendChild(el('div', 'sm', text))
  app.appendChild(box)
}

async function signIn(box: HTMLElement): Promise<void> {
  const answer = await request<AuthStart>('auth.start')
  if (!answer) return
  if ('error' in answer) {
    toast(answer.error)
    return
  }
  const opened = await openUrl(answer.url)
  const hint = el('div', 'm sm', opened ? 'Finish in your browser. This panel updates when you are signed in.' : 'Your browser did not open. Copy this link into it:')
  box.appendChild(hint)
  if (!opened) {
    const link = el('input')
    link.value = answer.url
    link.readOnly = true
    link.style.width = '100%'
    link.addEventListener('focus', () => link.select())
    box.appendChild(link)
  }
}

function ensureShell(): void {
  if (playerBox.isConnected) return
  app.replaceChildren(playerBox, tabsBox, listBox, footBox)
  renderTabs()
  loadTab()
  renderList()
  const signOut = el('button', 'link', 'Sign out of Spotify')
  signOut.addEventListener('click', async () => {
    await request('auth.signOut')
    playlists = null
    search = null
    queue = null
    opened = null
    await refresh()
  })
  footBox.replaceChildren(signOut)
}

function renderPlayer(): void {
  const playing = now()
  const devices = view?.status === 'ok' ? view.devices : []
  playerBox.replaceChildren()
  const head = el('div', 'head')
  const cover = playing?.cover ? el('img', 'cover') : el('div', 'cover')
  if (playing?.cover && cover instanceof HTMLImageElement) {
    cover.src = playing.cover
    cover.alt = ''
  } else {
    cover.appendChild(icon('music'))
    cover.classList.add('m')
  }
  const meta = el('div', 'meta')
  if (playing) {
    meta.append(el('div', 'b clip', playing.name), el('div', 'm sm clip', playing.artists))
    if (playing.album) meta.appendChild(el('div', 'm sm clip', playing.album))
  } else {
    meta.append(el('div', 'b', 'Nothing playing'), el('div', 'm sm', devices.length > 0 ? 'Pick a playlist below.' : 'Open Spotify on your Mac or phone.'))
  }
  const active = playing?.device ?? devices.find((device) => device.active) ?? null
  if (active || devices.length > 0) {
    const chip = el('button', 'dev')
    chip.append(icon(active ? deviceIcon(active) : 'speaker'), el('span', 'clip', active ? active.name : 'Pick a device'), icon('chev'))
    chip.setAttribute('aria-expanded', devOpen ? 'true' : 'false')
    chip.addEventListener('click', (event) => {
      event.stopPropagation()
      devOpen = !devOpen
      renderPop()
    })
    meta.appendChild(chip)
  }
  head.append(cover, meta)
  if (playing?.trackId) {
    const liked = playing.liked === true
    head.appendChild(
      iconButton(liked ? 'heartFull' : 'heart', liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', () => {
        if (!playing.trackId) return
        playing.liked = !liked
        renderPlayer()
        void send({ action: 'like', trackId: playing.trackId, on: !liked })
      }, liked ? 'on' : '')
    )
  }
  playerBox.appendChild(head)
  setTint(playing?.cover ?? null)

  if (playing) {
    const seek = el('div')
    const bar = el('div', 'bar')
    bar.setAttribute('role', 'slider')
    bar.setAttribute('aria-label', 'Seek')
    const fill = el('i')
    bar.appendChild(fill)
    bar.addEventListener('click', (event) => {
      const rect = bar.getBoundingClientRect()
      const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * playing.durationMs
      playing.progressMs = position
      viewAt = Date.now()
      updateProgress()
      void send({ action: 'seek', positionMs: position })
    })
    const times = el('div', 'times m')
    times.append(el('span', 'elapsed'), el('span', '', clock(playing.durationMs)))
    seek.append(bar, times)
    playerBox.appendChild(seek)
  }

  const ctrls = el('div', 'ctrls')
  const shuffleOn = playing?.shuffle === true
  ctrls.appendChild(
    iconButton('shuffle', shuffleOn ? 'Shuffle on' : 'Shuffle off', () => {
      if (playing) playing.shuffle = !shuffleOn
      renderPlayer()
      void send({ action: 'shuffle', on: !shuffleOn })
    }, shuffleOn ? 'on dot' : '')
  )
  ctrls.appendChild(iconButton('prev', 'Previous', () => void send({ action: 'previous' })))
  const isPlaying = playing?.isPlaying === true
  ctrls.appendChild(
    iconButton(isPlaying ? 'pause' : 'play', isPlaying ? 'Pause' : 'Play', () => {
      if (playing) {
        playing.progressMs = progressMs()
        viewAt = Date.now()
        playing.isPlaying = !isPlaying
      }
      renderPlayer()
      void send({ action: isPlaying ? 'pause' : 'play' })
    }, 'play')
  )
  ctrls.appendChild(iconButton('next', 'Next', () => void send({ action: 'next' })))
  const repeat = playing?.repeat ?? 'off'
  const nextRepeat = repeat === 'off' ? 'context' : repeat === 'context' ? 'track' : 'off'
  ctrls.appendChild(
    iconButton(repeat === 'track' ? 'repeat1' : 'repeat', `Repeat: ${repeat === 'off' ? 'off' : repeat === 'context' ? 'all' : 'one song'}`, () => {
      if (playing) playing.repeat = nextRepeat
      renderPlayer()
      void send({ action: 'repeat', mode: nextRepeat })
    }, repeat === 'off' ? '' : 'on dot')
  )
  playerBox.appendChild(ctrls)
  updateProgress()
  renderPop()
}

function updateProgress(): void {
  const playing = now()
  if (!playing) return
  const fill = playerBox.querySelector('.bar i') as HTMLElement | null
  const elapsed = playerBox.querySelector('.elapsed')
  const position = progressMs()
  if (fill) fill.style.width = `${playing.durationMs > 0 ? (position / playing.durationMs) * 100 : 0}%`
  if (elapsed) elapsed.textContent = clock(position)
}

function renderPop(): void {
  const devices = view?.status === 'ok' ? view.devices : []
  if (!devOpen || devices.length === 0) {
    popBox.remove()
    return
  }
  popBox.replaceChildren()
  for (const device of devices) {
    const row = el('button', `item${device.active ? ' on' : ''}`)
    row.append(icon(deviceIcon(device)), el('span', 'clip', device.name))
    row.addEventListener('click', (event) => {
      event.stopPropagation()
      devOpen = false
      renderPop()
      if (!device.active) void send({ action: 'transfer', deviceId: device.id })
    })
    popBox.appendChild(row)
  }
  const active = devices.find((device) => device.active)
  if (active && active.volume !== null) {
    const vol = el('div', 'vol m')
    const slider = el('input')
    slider.type = 'range'
    slider.min = '0'
    slider.max = '100'
    slider.value = String(active.volume)
    slider.setAttribute('aria-label', 'Volume')
    slider.addEventListener('click', (event) => event.stopPropagation())
    slider.addEventListener('change', () => {
      active.volume = Number(slider.value)
      void send({ action: 'volume', percent: Number(slider.value) })
    })
    vol.append(icon('vol'), slider)
    popBox.appendChild(vol)
  }
  if (!popBox.isConnected) app.appendChild(popBox)
}

function renderTabs(): void {
  tabsBox.replaceChildren()
  const labels: [Tab, string][] = [
    ['search', 'Search'],
    ['playlists', 'Playlists'],
    ['queue', 'Queue']
  ]
  for (const [key, label] of labels) {
    const button = el('button', tab === key ? 'on' : '', label)
    button.setAttribute('role', 'tab')
    button.setAttribute('aria-selected', tab === key ? 'true' : 'false')
    button.addEventListener('click', () => {
      if (tab === key && key === 'playlists' && opened) opened = null
      tab = key
      void orca.storage.set(TAB_KEY, key).catch(() => undefined)
      renderTabs()
      loadTab()
      renderList()
      if (key === 'search') searchInput.focus()
    })
    tabsBox.appendChild(button)
  }
  if (tab === 'search') {
    if (!searchBox.isConnected) tabsBox.after(searchBox)
  } else searchBox.remove()
}

function rowItem(row: Row, onPlay: () => void, extra?: { queue?: boolean; current?: boolean; onOpen?: () => void }): HTMLElement {
  const item = el('div', `item${extra?.current ? ' now' : ''}`)
  item.setAttribute('role', 'button')
  item.tabIndex = 0
  const text = el('div', 't')
  text.append(el('span', 'clip', row.name), el('span', 'm sm clip', row.sub))
  item.append(art(row.cover, row.kind === 'artist'), text)
  if (extra?.queue) item.appendChild(iconButton('addq', 'Add to queue', () => void send({ action: 'queue', uri: row.uri }).then((ok) => ok && toast(`Added "${row.name}" to the queue.`)), 'act'))
  if (extra?.onOpen) item.appendChild(iconButton('play', `Play ${row.name}`, onPlay, 'act'))
  const main = extra?.onOpen ?? onPlay
  item.addEventListener('click', main)
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') main()
  })
  return item
}

function note(text: string): HTMLElement {
  return el('div', 'note m sm', text)
}

function renderList(): void {
  listBox.replaceChildren()
  if (tab === 'playlists') {
    if (opened) {
      const current = opened
      const head = el('div', 'item')
      head.append(
        iconButton('back', 'Back to playlists', () => {
          opened = null
          renderList()
        }),
        art(current.row.cover)
      )
      const text = el('div', 't')
      text.append(el('span', 'b clip', current.row.name), el('span', 'm sm clip', current.row.sub))
      head.append(text, iconButton('play', `Play ${current.row.name}`, () => void send({ action: 'playContext', contextUri: current.row.uri }), 'play'))
      listBox.appendChild(head)
      if (!current.list) listBox.appendChild(note('Loading songs…'))
      else if (current.list.message) listBox.appendChild(note(current.list.message))
      else if (current.list.rows.length === 0) listBox.appendChild(note('This playlist is empty.'))
      else for (const row of current.list.rows) listBox.appendChild(rowItem(row, () => void send({ action: 'playContext', contextUri: current.row.uri, offsetUri: row.uri }), { queue: true, current: now()?.uri === row.uri }))
      return
    }
    if (!playlists) return void listBox.appendChild(note('Loading playlists…'))
    if (playlists.message) listBox.appendChild(note(playlists.message))
    if (!playlists.message && playlists.rows.length === 0) listBox.appendChild(note('You have no playlists yet.'))
    for (const row of playlists.rows) {
      listBox.appendChild(
        rowItem(row, () => void send({ action: 'playContext', contextUri: row.uri }), {
          onOpen: () => {
            opened = { row, list: null }
            renderList()
            void request<ListView>('playlist.tracks', { id: row.id }).then((list) => {
              if (opened?.row.id !== row.id) return
              opened.list = list ?? { rows: [], message: 'Could not load this playlist.' }
              renderList()
            })
          }
        })
      )
    }
    return
  }
  if (tab === 'search') {
    if (query.trim() === '') return void listBox.appendChild(note('Type to search Spotify.'))
    if (!search) return void listBox.appendChild(note('Searching…'))
    if (search.message) return void listBox.appendChild(note(search.message))
    const sections: [string, Row[]][] = [
      ['Songs', search.songs],
      ['Artists', search.artists],
      ['Albums', search.albums],
      ['Playlists', search.playlists]
    ]
    let any = false
    for (const [label, list] of sections) {
      if (list.length === 0) continue
      any = true
      listBox.appendChild(el('div', 'sec', label))
      for (const row of list) {
        listBox.appendChild(
          row.kind === 'track'
            ? rowItem(row, () => void send({ action: 'playTrack', uri: row.uri }), { queue: true, current: now()?.uri === row.uri })
            : rowItem(row, () => void send({ action: 'playContext', contextUri: row.uri }))
        )
      }
    }
    if (!any) listBox.appendChild(note(`Nothing found for "${query.trim()}".`))
    return
  }
  if (!queue) return void listBox.appendChild(note('Loading the queue…'))
  if (queue.message) return void listBox.appendChild(note(queue.message))
  if (queue.now) {
    listBox.appendChild(el('div', 'sec', 'Now playing'))
    listBox.appendChild(rowItem(queue.now, () => undefined, { current: true }))
  }
  listBox.appendChild(el('div', 'sec', 'Up next'))
  if (queue.next.length === 0) listBox.appendChild(note('Nothing queued. Add songs from Search or a playlist.'))
  for (const row of queue.next) listBox.appendChild(rowItem(row, () => void send({ action: 'playTrack', uri: row.uri })))
}

function loadTab(): void {
  if (tab === 'playlists' && !playlists) {
    void request<ListView>('playlists.get').then((list) => {
      playlists = list ?? { rows: [], message: 'Could not load your playlists.' }
      if (tab === 'playlists') renderList()
    })
  }
  if (tab === 'queue') {
    void request<QueueView>('queue.get').then((answer) => {
      queue = answer ?? { now: null, next: [], message: 'Could not load the queue.' }
      if (tab === 'queue') renderList()
    })
  }
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0
searchInput.addEventListener('input', () => {
  query = searchInput.value
  if (searchTimer) clearTimeout(searchTimer)
  search = null
  renderList()
  if (query.trim() === '') return
  searchTimer = setTimeout(() => {
    const seq = ++searchSeq
    void request<SearchView>('search', { q: query }).then((answer) => {
      if (seq !== searchSeq) return
      search = answer ?? { songs: [], artists: [], albums: [], playlists: [], message: 'Search failed.' }
      if (tab === 'search') renderList()
    })
  }, 300)
})

let lastTrack: string | null = null
let refreshing = false
async function refresh(): Promise<void> {
  if (refreshing) return
  refreshing = true
  const answer = await request<PlayerView>('player.get')
  refreshing = false
  if (!answer) return
  view = answer
  viewAt = Date.now()
  if (answer.status === 'signedOut') {
    playerBox.remove()
    renderSignedOut(answer.message, answer.needsClientId)
    return
  }
  if (answer.status === 'error') {
    ensureShell()
    toast(answer.message)
    return
  }
  ensureShell()
  renderPlayer()
  const track = answer.now?.uri ?? null
  if (track !== lastTrack) {
    lastTrack = track
    if (tab === 'queue') loadTab()
    else if (tab !== 'search' || search) renderList()
  }
}

document.addEventListener('click', () => {
  if (!devOpen) return
  devOpen = false
  renderPop()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && devOpen) {
    devOpen = false
    renderPop()
  }
})

orca.plugin.on('changed', () => void refresh())
setInterval(() => {
  if (document.visibilityState !== 'hidden') void refresh()
}, POLL_MS)
setInterval(updateProgress, 500)

void orca.storage
  .get(TAB_KEY)
  .catch(() => null)
  .then((saved) => {
    if (saved === 'search' || saved === 'playlists' || saved === 'queue') tab = saved
    return refresh()
  })

