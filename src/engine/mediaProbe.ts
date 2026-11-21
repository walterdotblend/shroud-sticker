import type { MediaInfo } from './types'

/**
 * Parses GIF87a / GIF89a Graphic Control Extension blocks to compute total animation duration in seconds.
 */
export async function probeGifMeta(file: File): Promise<{ duration: number; sourceFps: number }> {
  const buf = await file.slice(0, 8 * 1024 * 1024).arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes.length < 13) return { duration: 3, sourceFps: 15 }
  // Verify "GIF" header
  if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) return { duration: 3, sourceFps: 15 }

  let totalDelayCs = 0
  let frames = 0
  for (let i = 0; i < bytes.length - 7; i++) {
    // Graphic Control Extension: 0x21 0xF9 0x04 <packed> <delayLo> <delayHi> <transIdx> 0x00
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04 && bytes[i + 7] === 0x00) {
      const delayCs = bytes[i + 4] | (bytes[i + 5] << 8)
      totalDelayCs += delayCs > 1 ? delayCs : 10
      frames += 1
      i += 7
    }
  }
  const sec = totalDelayCs / 100
  const duration = sec > 0.1 ? sec : 3
  const rawFps = frames > 1 && duration > 0 ? Math.round(frames / duration) : 15
  const sourceFps = Math.max(8, Math.min(30, rawFps))
  return { duration, sourceFps }
}

function probeImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 })
    img.onerror = () => reject(new Error('No se pudo leer las dimensiones del GIF/imagen.'))
    img.src = objectUrl
  })
}

function probeVideoMetadata(objectUrl: string): Promise<{ width: number; height: number; duration: number; sourceFps: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    video.onloadedmetadata = () => {
      const width = video.videoWidth || 512
      const height = video.videoHeight || 512
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5

      // Measure real video FPS quickly (~220ms) if requestVideoFrameCallback is supported
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vAny = video as any
      if (typeof vAny.requestVideoFrameCallback !== 'function' || duration < 0.25) {
        resolve({ width, height, duration, sourceFps: 30 })
        return
      }

      let firstMediaTime: number | null = null
      let firstPresented: number | null = null
      let done = false

      const finish = (fps: number) => {
        if (done) return
        done = true
        video.pause()
        video.src = ''
        resolve({ width, height, duration, sourceFps: Math.max(8, Math.min(60, Math.round(fps))) })
      }

      const timer = setTimeout(() => finish(30), 450)

      const onFrame = (_now: number, meta: { mediaTime: number; presentedFrames: number }) => {
        if (done) return
        if (firstMediaTime === null) {
          firstMediaTime = meta.mediaTime
          firstPresented = meta.presentedFrames
        } else {
          const dt = meta.mediaTime - firstMediaTime
          const df = meta.presentedFrames - (firstPresented ?? 0)
          if (dt >= 0.18 && df >= 2) {
            clearTimeout(timer)
            finish(df / dt)
            return
          }
        }
        vAny.requestVideoFrameCallback(onFrame)
      }

      vAny.requestVideoFrameCallback(onFrame)
      video.play().catch(() => {
        clearTimeout(timer)
        finish(30)
      })
    }

    video.onerror = () => reject(new Error('No se pudo cargar el video en el navegador.'))
    video.src = objectUrl
  })
}

export async function probeMediaFile(file: File): Promise<MediaInfo> {
  const objectUrl = URL.createObjectURL(file)
  const lower = file.name.toLowerCase()
  const isGif = file.type === 'image/gif' || lower.endsWith('.gif') || file.type === 'image/webp' || lower.endsWith('.webp')

  try {
    if (isGif) {
      const [{ width, height }, gifMeta] = await Promise.all([
        probeImageDimensions(objectUrl),
        lower.endsWith('.gif') || file.type === 'image/gif'
          ? probeGifMeta(file)
          : Promise.resolve({ duration: 4, sourceFps: 15 }),
      ])
      return {
        name: file.name,
        width,
        height,
        duration: gifMeta.duration,
        sourceFps: gifMeta.sourceFps,
        sizeBytes: file.size,
        isGif: true,
        objectUrl,
        file,
      }
    }

    const { width, height, duration, sourceFps } = await probeVideoMetadata(objectUrl)
    return {
      name: file.name,
      width,
      height,
      duration,
      sourceFps,
      sizeBytes: file.size,
      isGif: false,
      objectUrl,
      file,
    }
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    throw err
  }
}
