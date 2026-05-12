// Passive OSC network listener — opens a UDP port and records every
// incoming message's sender IP/port + OSC path. The Pool drawer's
// Network tab consumes the resulting `DiscoveredOscDevice[]` so the
// user can drag-drop a sender straight onto the Edit sidebar.
//
// Design choice: passive listening (no mDNS, no OSCQuery yet). The
// user picks an inbox port (default 9000 — the de facto OSC port) and
// any device on the network that sends to <localIP>:<port> shows up.
// This works for every OSC implementation in existence and needs no
// cooperation from the sender; the cost is the user has to tell their
// device "send to <our IP>:9000" themselves. Future: layer mDNS /
// OSCQuery discovery on top so cooperating devices auto-pair.

import * as osc from 'osc'
import * as os from 'os'
import type {
  DiscoveredOscAddress,
  DiscoveredOscDevice,
  NetworkListenerStatus
} from '@shared/types'

// 9000 is the canonical OSC inbox port (TouchOSC, Lemur, Max/MSP demos,
// SuperCollider's sclang default, etc.). The user can override.
const DEFAULT_PORT = 9000

// Hard cap on tracked addresses per device. A pathological streaming
// sender that sprays /pix/0/0/r ... /pix/1023/767/b would otherwise
// pile up megabytes in the map; the UI also can't render thousands of
// rows usefully. 256 is enough for any reasonable instrument layout.
const MAX_ADDRESSES_PER_DEVICE = 256

// Cap on total devices. Most LANs have <20 plausible senders; this
// bound is mostly defensive (against a misconfigured broadcast spammer).
const MAX_DEVICES = 64

// Time-to-live for an address — addresses unseen for this long fall off
// the per-device list so the UI doesn't accumulate stale paths from a
// long-running session. Devices themselves persist until manual clear.
const ADDRESS_TTL_MS = 60_000

export class OscNetworkListener {
  private udp: osc.UDPPort | null = null
  private port = DEFAULT_PORT
  private enabled = false
  private lastError = ''
  private devices = new Map<string, DiscoveredOscDevice>()
  // Set whenever observe() mutates state; `flush()` checks it on the
  // periodic IPC timer so we only push to the renderer when something
  // actually changed (cheap when the network is quiet).
  private dirty = false
  // Push callback invoked by external code on each tick of the IPC
  // batching timer (set up in main/index.ts). Same shape as OscSender.
  private onUpdate:
    | ((payload: {
        status: NetworkListenerStatus
        devices: DiscoveredOscDevice[]
      }) => void)
    | null = null

  setOnUpdate(
    cb:
      | ((payload: {
          status: NetworkListenerStatus
          devices: DiscoveredOscDevice[]
        }) => void)
      | null
  ): void {
    this.onUpdate = cb
  }

  getStatus(): NetworkListenerStatus {
    return {
      enabled: this.enabled,
      port: this.port,
      localAddresses: getLocalIPv4Addresses(),
      lastError: this.lastError
    }
  }

  list(): DiscoveredOscDevice[] {
    // Trim stale addresses on every fetch — cheap (max 256 entries per
    // device, max 64 devices) and saves a separate sweeper timer.
    const now = Date.now()
    const out: DiscoveredOscDevice[] = []
    this.devices.forEach((dev) => {
      const fresh = dev.addresses.filter((a) => now - a.lastSeen <= ADDRESS_TTL_MS)
      out.push({ ...dev, addresses: fresh })
    })
    // Most-recent first so freshly-active senders pop to the top.
    out.sort((a, b) => b.lastSeen - a.lastSeen)
    return out
  }

  clear(): void {
    this.devices.clear()
    this.dirty = true
    // Immediately push the empty snapshot so the UI updates without
    // waiting for the next periodic flush.
    if (this.onUpdate) {
      this.onUpdate({ status: this.getStatus(), devices: [] })
    }
  }

  /**
   * Toggle the listener on/off and optionally re-bind on a different
   * port. Returns a status snapshot describing the post-action state
   * (so the renderer can read back the actual port + any bind error).
   */
  async setEnabled(enabled: boolean, port?: number): Promise<NetworkListenerStatus> {
    // Port-change first — if the user only wanted to change ports
    // while staying enabled, we close + re-open. Same code path
    // handles the "off → on with new port" case.
    if (port !== undefined && Number.isFinite(port) && port >= 1 && port <= 65535) {
      const intPort = Math.floor(port)
      if (intPort !== this.port) {
        this.port = intPort
        if (this.enabled) {
          // Hot re-bind. Close + open is simpler than trying to
          // mutate the bound port in place (the osc package doesn't
          // expose that anyway).
          await this.closeUdp()
          await this.openUdp()
          return this.getStatus()
        }
      }
    }
    if (enabled === this.enabled) return this.getStatus()
    if (enabled) await this.openUdp()
    else await this.closeUdp()
    return this.getStatus()
  }

  /**
   * Called externally on the same 50ms timer the OSC sender uses to
   * batch outgoing-event IPC. Pushes only when something changed.
   */
  flush(): void {
    if (!this.dirty) return
    this.dirty = false
    if (this.onUpdate) {
      this.onUpdate({ status: this.getStatus(), devices: this.list() })
    }
  }

  // ── Internals ────────────────────────────────────────────────────

  private openUdp(): Promise<void> {
    return new Promise((resolve) => {
      const port = new osc.UDPPort({
        localAddress: '0.0.0.0',
        localPort: this.port,
        metadata: true
      })
      let settled = false
      port.on('ready', () => {
        this.enabled = true
        this.lastError = ''
        this.udp = port
        if (!settled) {
          settled = true
          resolve()
        }
      })
      port.on('error', (err: Error) => {
        // EADDRINUSE / EACCES — surface to the UI via lastError, keep
        // enabled=false so the user can pick another port. We DON'T
        // reject so the renderer's `setEnabled` promise resolves with
        // a status snapshot describing the failure.
        console.error('[OSC Network] listener error:', err.message)
        this.lastError = err.message
        if (!settled) {
          // Bind failed during open — drop the half-built port and
          // surface failure via the resolved status snapshot.
          settled = true
          this.enabled = false
          this.udp = null
          try {
            port.close()
          } catch {
            /* ignore — already failed */
          }
          resolve()
        } else {
          // Post-ready error (ICMP "destination unreachable", socket
          // suddenly closed by another process, etc.) — tear down so
          // the next packet doesn't try to use a dead socket. The
          // status push the next flush() emits will show enabled=false
          // with the error message so the UI can prompt the user.
          this.enabled = false
          if (this.udp === port) {
            try {
              port.close()
            } catch {
              /* ignore */
            }
            this.udp = null
          }
          this.dirty = true
        }
      })
      // osc.js types `EventEmitter.on` with `(...args: unknown[]) => void`,
      // so cast inside instead of typing the params (TS won't narrow the
      // overload picked from a string literal).
      port.on('message', (...args: unknown[]) => {
        const msg = args[0] as
          | { address?: unknown; args?: unknown }
          | undefined
        const info = args[2] as { address?: unknown; port?: unknown } | undefined
        if (!msg || typeof msg.address !== 'string') return
        if (!info || typeof info.address !== 'string' || typeof info.port !== 'number') {
          return
        }
        const rawArgs = Array.isArray(msg.args) ? msg.args : []
        const normalised = rawArgs.map((a) => {
          const aa = a as { type?: unknown; value?: unknown }
          return {
            type: String(aa.type ?? ''),
            value: aa.value
          }
        })
        this.observe(info.address, info.port, {
          address: msg.address,
          args: normalised
        })
      })
      try {
        port.open()
      } catch (e) {
        // Synchronous throw — same handling as the async error path.
        console.error('[OSC Network] open failed:', (e as Error).message)
        this.lastError = (e as Error).message
        this.enabled = false
        this.udp = null
        if (!settled) {
          settled = true
          resolve()
        }
      }
    })
  }

  private closeUdp(): Promise<void> {
    return new Promise((resolve) => {
      const port = this.udp
      if (!port) {
        this.enabled = false
        resolve()
        return
      }
      // Detach from `this.udp` first so observe() rejects late packets
      // (it now checks enabled before touching the device map).
      this.udp = null
      this.enabled = false
      // Wait for the underlying socket's 'close' event before
      // resolving so a fast re-bind on a new port can't race the OS
      // releasing the old socket. The osc.UDPPort wraps a dgram
      // socket; we hook 'close' on either the port or its inner
      // socket if available. A safety timeout resolves anyway after
      // 500ms in case the close event never fires (e.g. socket
      // already closed, listener leak).
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        resolve()
      }
      const timeoutId = setTimeout(finish, 500)
      try {
        // osc.UDPPort re-emits 'close' from its inner dgram socket.
        // Hook listenerCallback on the port object — if it lacks
        // event support (unlikely), the timeout above still resolves.
        ;(port as unknown as { once?: (e: string, cb: () => void) => void }).once?.(
          'close',
          finish
        )
        port.close()
      } catch {
        /* ignore — fallback to the timeout */
      }
    })
  }

  private observe(
    ip: string,
    port: number,
    msg: { address: string; args: Array<{ type: string; value: unknown }> }
  ): void {
    // Guard: when the listener has been torn down (closeUdp set
    // `enabled=false` + nulled `udp`), late packets still in the
    // dgram queue can hit this handler. Dropping them here avoids
    // mutating the device map after the user has explicitly stopped
    // listening.
    if (!this.enabled) return
    const key = `${ip}:${port}`
    const now = Date.now()
    let dev = this.devices.get(key)
    if (!dev) {
      // New sender. Refuse to grow past MAX_DEVICES so a broadcast
      // flood can't OOM the listener.
      if (this.devices.size >= MAX_DEVICES) return
      dev = {
        id: key,
        ip,
        port,
        firstSeen: now,
        lastSeen: now,
        packetCount: 0,
        addresses: []
      }
      this.devices.set(key, dev)
    }
    dev.lastSeen = now
    dev.packetCount += 1
    const argTypes = msg.args.map((a) => String(a.type))
    const argsPreview = msg.args
      .slice(0, 4)
      .map((a) => formatArgPreview(String(a.type), a.value))
      .join(' ')
    let addr = dev.addresses.find((a) => a.path === msg.address)
    if (!addr) {
      // Cap distinct addresses per device. The pathological case is a
      // sender that encodes a unique path per pixel/voxel/whatever —
      // we'd rather show the first 256 than blow the IPC payload.
      if (dev.addresses.length >= MAX_ADDRESSES_PER_DEVICE) {
        this.dirty = true
        return
      }
      addr = {
        path: msg.address,
        lastSeen: now,
        count: 0,
        argTypes,
        argsPreview
      }
      dev.addresses.push(addr)
    }
    addr.lastSeen = now
    addr.count += 1
    addr.argTypes = argTypes
    addr.argsPreview = argsPreview
    this.dirty = true
  }
}

/**
 * IPv4 addresses bound to the host's external NICs — the "send to me"
 * targets the user can configure on their OSC sender. Skips internal
 * loopback (127.0.0.1) because that's already obvious and isn't
 * routable from other machines on the LAN.
 */
function getLocalIPv4Addresses(): string[] {
  const out: string[] = []
  const ifs = os.networkInterfaces()
  for (const name in ifs) {
    const list = ifs[name]
    if (!list) continue
    for (const ni of list) {
      // Newer Node typings expose `family` as 'IPv4' (string); older
      // ones used the number 4. Accept both.
      const fam = ni.family as unknown
      const isV4 = fam === 'IPv4' || fam === 4
      if (isV4 && !ni.internal) out.push(ni.address)
    }
  }
  return out
}

function formatArgPreview(type: string, value: unknown): string {
  if (type === 'f' || type === 'd') {
    const n = Number(value)
    if (Number.isFinite(n)) {
      // Trim trailing zeros so 1.000 reads as 1.
      const s = n.toFixed(3)
      return s.replace(/\.?0+$/, '') || '0'
    }
    return String(value)
  }
  if (type === 'i') return String(value)
  if (type === 's') return `"${String(value).slice(0, 32)}"`
  if (type === 'T') return 'true'
  if (type === 'F') return 'false'
  if (type === 'N') return 'nil'
  if (type === 'b') return `[blob]`
  return String(value)
}

// The inference helper that maps a discovered address's OSC type tags
// to an `InstrumentFunction['paramType']` lives in `@shared/factory.ts`
// (`inferParamTypeFromArgTypes`) so the renderer can import it
// directly when materialising a Network tab device into a Pool
// Instrument Template.
