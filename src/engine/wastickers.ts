import JSZip from 'jszip'
import QRCode from 'qrcode'
import { WHATSAPP_MAX_BYTES, WHATSAPP_STICKER_SIZE } from './types'

export interface PackStickerItem {
  id: string
  name: string
  blob: Blob
  url: string
  sizeBytes: number
}

async function createTrayPng(webpUrl: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const ctx = canvas.getContext('2d')!

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = webpUrl
    })
    ctx.clearRect(0, 0, 96, 96)
    ctx.drawImage(img, 0, 0, 96, 96)
  } catch {
    ctx.fillStyle = '#8b1922'
    ctx.fillRect(0, 0, 96, 96)
  }

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? new Blob()), 'image/png')
  })
}

export async function validateWhatsAppWebp(file: File): Promise<{ ok: true } | { ok: false; reason: string }> {
  const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
  if (!isWebp) {
    return { ok: false, reason: 'Only .webp files are valid WhatsApp stickers.' }
  }
  if (file.size > WHATSAPP_MAX_BYTES) {
    return {
      ok: false,
      reason: `File exceeds WhatsApp 500 KB limit (${(file.size / 1024).toFixed(1)} KB).`,
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => reject(new Error('Could not decode .webp image.'))
      img.src = url
    })
    if (dims.w !== WHATSAPP_STICKER_SIZE || dims.h !== WHATSAPP_STICKER_SIZE) {
      return {
        ok: false,
        reason: `Must be 512×512 px (received ${dims.w}×${dims.h}).`,
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Builds a .wastickers ZIP pack from a list of stickers (1..30).
 * No duplicate copies are added unless needed (if <3 items, Sticker Maker still opens 1+,
 * or you can add multiple stickers to your pack).
 */
export async function buildWastickersPack(
  items: PackStickerItem[],
  packTitle: string
): Promise<Blob> {
  if (items.length === 0) {
    throw new Error('Pack is empty.')
  }
  const zip = new JSZip()
  const cleanTitle = (packTitle || 'SHROUD Pack').slice(0, 40)
  const trayPng = await createTrayPng(items[0].url)

  zip.file('title.txt', cleanTitle)
  zip.file('author.txt', 'SHROUD Sticker Forge')
  zip.file('tray.png', trayPng)

  const capped = items.slice(0, 30)
  capped.forEach((item, idx) => {
    zip.file(`${idx + 1}.webp`, item.blob)
  })

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function generateAppQrDataUrl(targetUrl: string): Promise<string> {
  return QRCode.toDataURL(targetUrl, {
    width: 260,
    margin: 2,
    color: {
      dark: '#e6c2c2',
      light: '#0b080a',
    },
  })
}
