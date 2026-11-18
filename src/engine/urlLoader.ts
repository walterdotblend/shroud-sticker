/**
 * Client-side URL downloader for direct GIF / MP4 / WebM links.
 * Normalizes common Imgur .gifv links to .mp4 and handles CORS errors gracefully.
 */

export function normalizeMediaUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim()
  if (!trimmed) return ''
  // Convert imgur .gifv -> .mp4
  if (/^https?:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.gifv(\?.*)?$/i.test(trimmed)) {
    return trimmed.replace(/\.gifv/i, '.mp4')
  }
  return trimmed
}

function guessFilename(url: string, mimeType: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (last && /\.(gif|mp4|webm|mov|webp)$/i.test(last)) {
      return last
    }
  } catch {
    // ignore
  }
  if (mimeType.includes('gif')) return 'remote-media.gif'
  if (mimeType.includes('webm')) return 'remote-media.webm'
  if (mimeType.includes('webp')) return 'remote-media.webp'
  return 'remote-media.mp4'
}

export async function downloadMediaFromUrl(rawUrl: string): Promise<File> {
  const url = normalizeMediaUrl(rawUrl)
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Ingresa una URL válida que empiece con http:// o https://')
  }

  let response: Response
  try {
    response = await fetch(url, { mode: 'cors' })
  } catch {
    throw new Error(
      'El servidor remoto bloqueó la descarga directa por CORS. Descarga el GIF/video en tu PC y arrástralo aquí.'
    )
  }

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status} al descargar el archivo.`)
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  const blob = await response.blob()

  if (blob.size === 0) {
    throw new Error('El archivo descargado está vacío.')
  }
  if (contentType.includes('text/html')) {
    throw new Error(
      'La URL apunta a una página HTML, no a un archivo directo (.gif / .mp4). Copia el enlace directo del medio.'
    )
  }

  const mime = contentType.split(';')[0].trim() || blob.type || 'video/mp4'
  const filename = guessFilename(url, mime)
  return new File([blob], filename, { type: mime })
}
