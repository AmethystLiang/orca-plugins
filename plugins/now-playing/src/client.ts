import { apiErrorMessage, type ApiCall } from './spotify'

export type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}>

export type Vault = {
  get(): Promise<string | null>
  set(value: string): Promise<void>
  clear(): Promise<void>
}

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly signedOut = false
  ) {
    super(message)
  }
}

export type ClientDeps = { fetch: FetchFn; vault: Vault; clientId: () => Promise<string>; now: () => number }

const API = 'https://api.spotify.com/v1'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

export class SpotifyClient {
  private access: { token: string; until: number } | null = null
  private refreshing: Promise<string> | null = null

  constructor(private readonly deps: ClientDeps) {}

  async signedIn(): Promise<boolean> {
    return (await this.deps.vault.get()) !== null
  }

  async exchange(code: string, verifier: string, redirectUri: string): Promise<void> {
    const clientId = await this.deps.clientId()
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier })
    await this.takeToken(body)
  }

  async signOut(): Promise<void> {
    this.access = null
    await this.deps.vault.clear()
  }

  private async takeToken(body: URLSearchParams): Promise<string> {
    const response = await this.deps.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
    const json = (await response.json().catch(() => null)) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown } | null
    if (!response.ok || typeof json?.access_token !== 'string') {
      const dead = json?.error === 'invalid_grant' || json?.error === 'invalid_client'
      if (dead) await this.signOut()
      throw new SpotifyError(dead ? 'Spotify sign-in expired. Sign in again.' : 'Spotify sign-in failed. Try again.', response.status, dead)
    }
    if (typeof json.refresh_token === 'string') await this.deps.vault.set(json.refresh_token)
    const seconds = typeof json.expires_in === 'number' ? json.expires_in : 3600
    this.access = { token: json.access_token, until: this.deps.now() + (seconds - 60) * 1000 }
    return json.access_token
  }

  private async token(): Promise<string> {
    if (this.access && this.deps.now() < this.access.until) return this.access.token
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const refresh = await this.deps.vault.get()
        if (refresh === null) throw new SpotifyError('Not signed in.', 401, true)
        const clientId = await this.deps.clientId()
        return this.takeToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId }))
      })().finally(() => {
        this.refreshing = null
      })
    }
    return this.refreshing
  }

  async call(request: ApiCall, retried = false): Promise<unknown> {
    const token = await this.token()
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (request.body) headers['content-type'] = 'application/json'
    const response = await this.deps.fetch(`${API}${request.path}`, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined
    })
    if (response.status === 401 && !retried) {
      this.access = null
      return this.call(request, true)
    }
    if (response.status === 204 || response.status === 202) return null
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new SpotifyError(apiErrorMessage(response.status, body), response.status)
    return body
  }

  get(path: string): Promise<unknown> {
    return this.call({ method: 'GET', path })
  }
}
