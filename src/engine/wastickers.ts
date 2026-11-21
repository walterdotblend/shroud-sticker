import JSZip from 'jszip'
import QRCode from 'qrcode'

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

/**
 * Builds a WhatsApp-ready .wastickers ZIP pack.
 * Includes 3 slots (1.webp, 2.webp, 3.webp) so WhatsApp's 3-sticker minimum per pack
 * is automatically satisfied and Sticker Maker lets you tap "Add to WhatsApp" in 1 click.
 */
export async function buildWastickersPack(webpBlob: Blob, webpUrl: string, packTitle: string): Promise<Blob> {
  const zip = new JSZip()
  const cleanTitle = (packTitle || 'SHROUD Pack').slice(0, 40)
  const trayPng = await createTrayPng(webpUrl)

  zip.file('title.txt', cleanTitle)
  zip.file('author.txt', 'SHROUD Sticker Forge')
  zip.file('tray.png', trayPng)
  zip.file('1.webp', webpBlob)
  zip.file('2.webp', webpBlob)
  zip.file('3.webp', webpBlob)

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
