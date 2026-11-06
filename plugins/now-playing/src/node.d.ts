declare module 'node:http' {
  export type IncomingMessage = { url?: string }
  export type ServerResponse = {
    writeHead(status: number, headers?: Record<string, string>): ServerResponse
    end(body?: string): void
  }
  export type Server = {
    listen(port: number, host: string, callback: () => void): Server
    close(): void
    on(event: 'error', listener: (error: Error & { code?: string }) => void): Server
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server
}

declare function setTimeout(run: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void
