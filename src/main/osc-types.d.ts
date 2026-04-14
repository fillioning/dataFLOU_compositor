// Minimal typings for the `osc` package (only the bits we use).
declare module 'osc' {
  export interface UDPPortOptions {
    localAddress?: string
    localPort?: number
    remoteAddress?: string
    remotePort?: number
    metadata?: boolean
    broadcast?: boolean
  }
  export interface OscArg {
    type: 'i' | 'f' | 's' | 'T' | 'F' | 'd' | 'b' | 'N' | 'I'
    value?: number | string | boolean | Uint8Array | null
  }
  export interface OscMessage {
    address: string
    args: OscArg[]
  }
  export class UDPPort {
    constructor(opts: UDPPortOptions)
    open(): void
    close(): void
    send(msg: OscMessage, address?: string, port?: number): void
    on(event: 'ready', cb: () => void): this
    on(event: 'error', cb: (err: Error) => void): this
    on(event: 'message', cb: (msg: OscMessage, timeTag: unknown, info: unknown) => void): this
    on(event: string, cb: (...args: unknown[]) => void): this
  }
}
