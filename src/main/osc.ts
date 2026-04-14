// OSC sender — one UDP socket bound locally, messages sent per-destination.

import * as osc from 'osc'

type Arg = { type: 'i' | 'f' | 's' | 'T' | 'F'; value: number | string | boolean }

export class OscSender {
  private udp: osc.UDPPort | null = null
  private ready = false
  private queue: Array<() => void> = []

  async start(localPort = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = new osc.UDPPort({
        localAddress: '0.0.0.0',
        localPort,
        metadata: true
      })
      port.on('ready', () => {
        this.ready = true
        this.queue.forEach((fn) => fn())
        this.queue.length = 0
        resolve()
      })
      port.on('error', (err: Error) => {
        // Log but don't crash — send errors are non-fatal
        console.error('[OSC] error:', err.message)
      })
      try {
        port.open()
      } catch (e) {
        reject(e)
        return
      }
      this.udp = port
    })
  }

  stop(): void {
    if (this.udp) {
      try {
        this.udp.close()
      } catch {
        /* ignore */
      }
      this.udp = null
      this.ready = false
    }
  }

  send(ip: string, port: number, address: string, arg: Arg): void {
    const doSend = (): void => {
      if (!this.udp) return
      // osc.js uses `args` with typed metadata when metadata=true
      const args = [{ type: arg.type, value: arg.value }]
      try {
        this.udp.send({ address, args }, ip, port)
      } catch (e) {
        // Resolving hostnames can fail; swallow to keep the tick loop alive.
        console.error('[OSC] send failed', ip, port, (e as Error).message)
      }
    }
    if (this.ready) doSend()
    else this.queue.push(doSend)
  }
}
