import { Peer } from 'peerjs'
import { generateAppQrDataUrl } from './wastickers'

export interface P2pStickerPayload {
  filename: string
  wastickersBytes: ArrayBuffer
  webpBytes: ArrayBuffer
}

export interface P2pHostSession {
  peerId: string
  shareUrl: string
  qrDataUrl: string
  destroy: () => void
}

/**
 * Starts a real WebRTC P2P sender session on the PC browser.
 * When the user scans the QR code with their phone, the phone connects directly
 * to this browser tab via WebRTC DataChannel and downloads the .wastickers file (100% local P2P).
 */
export async function startP2pStickerHost(
  payload: P2pStickerPayload,
  onStatus: (status: string) => void
): Promise<P2pHostSession> {
  return new Promise((resolve, reject) => {
    const peer = new Peer()
    const timeout = setTimeout(() => {
      peer.destroy()
      reject(new Error('WebRTC signaling timeout'))
    }, 10000)

    peer.on('open', async (id) => {
      clearTimeout(timeout)
      const base = window.location.origin + window.location.pathname
      const shareUrl = `${base}?p2p=${encodeURIComponent(id)}`
      const qrDataUrl = await generateAppQrDataUrl(shareUrl)
      onStatus('Waiting for mobile scan (keep this tab open)...')

      peer.on('connection', (conn) => {
        onStatus('Mobile connected! Sending .wastickers via P2P...')
        conn.on('open', () => {
          conn.send(payload)
          onStatus('✓ Sticker sent to your phone via P2P!')
        })
      })

      resolve({
        peerId: id,
        shareUrl,
        qrDataUrl,
        destroy: () => peer.destroy(),
      })
    })

    peer.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

export interface ReceivedP2pSticker {
  filename: string
  wastickersBlob: Blob
  webpBlob: Blob
  webpUrl: string
}

/**
 * Runs on the mobile phone when opened via QR code (?p2p=<peerId>).
 * Connects directly to the PC browser and downloads the forged .wastickers pack.
 */
export async function receiveP2pStickerFromHost(
  hostPeerId: string,
  onStatus: (status: string) => void
): Promise<ReceivedP2pSticker> {
  return new Promise((resolve, reject) => {
    onStatus('Connecting directly to your PC via WebRTC P2P...')
    const peer = new Peer()
    const timeout = setTimeout(() => {
      peer.destroy()
      reject(new Error('Timed out connecting to PC. Make sure the PC tab is still open.'))
    }, 18000)

    peer.on('open', () => {
      const conn = peer.connect(hostPeerId, { reliable: true })

      conn.on('open', () => {
        onStatus('Connected to PC! Receiving sticker bytes...')
      })

      conn.on('data', (raw) => {
        clearTimeout(timeout)
        const data = raw as P2pStickerPayload
        const wastickersBlob = new Blob([data.wastickersBytes], {
          type: 'application/octet-stream',
        })
        const webpBlob = new Blob([data.webpBytes], { type: 'image/webp' })
        const webpUrl = URL.createObjectURL(webpBlob)
        onStatus('✓ Sticker received from PC!')
        setTimeout(() => peer.destroy(), 1500)
        resolve({
          filename: data.filename || 'shroud-pack.wastickers',
          wastickersBlob,
          webpBlob,
          webpUrl,
        })
      })

      conn.on('error', (err) => {
        clearTimeout(timeout)
        peer.destroy()
        reject(err)
      })
    })

    peer.on('error', (err) => {
      clearTimeout(timeout)
      peer.destroy()
      reject(err)
    })
  })
}
