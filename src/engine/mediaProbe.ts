import { GifReader } from 'omggif'
import type { MediaInfo } from './types'

/**
 * Uses omggif's GifReader to compute exact frame count, duration (seconds), and real source FPS.
 */
export async function probeGifMeta(file: File): Promise<{ duration: number; sourceFps: number }> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer())
    const reader = new GifReader(buf)
    const numFrames = reader.numFrames()
    if (numFrames <= 0) return { duration: 3, sourceFps: 15 }

    let totalDelayCs = 0
    for (let i = 0; i < numFrames; i++) {
      const info = reader.frameInfo(i)
      totalDelayCs += info.delay > 1 ? info.delay : 10
    }
    const sec = totalDelayCs / 100
    const duration = sec > 0.1 ? sec : 3
    const rawFps = Math.round(numFrames / duration)
    const sourceFps = Math.max(5, Math.min(45, rawFps))
    return { duration, sourceFps }
  } catch {
    return { duration: 3, sourceFps: 15 }
  }
}

function probeImageDimensions(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 })
    img.onerror = () => reject(new Error('Could not read GIF/image dimensions.'))
    img.src = objectUrl
  })
}

function probeVideoMetadata(
  objectUrl: string
): Promise<{ width: number; height: number; duration: number; sourceFps: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    // Attach invisibly to DOM so browser does not throttle requestVideoFrameCallback
    video.style.position = 'fixed'
    video.style.width = '1px'
    video.style.height = '1px'
    video.style.opacity = '0'
    video.style.pointerEvents = 'none'
    video.style.left = '-9999px'
    document.body.appendChild(video)

    const cleanup = () => {
      try {
        video.pause()
        video.removeAttribute('src')
        video.load()
        video.remove()
      } catch {
        // ignore
      }
    }

    video.onloadedmetadata = () => {
      const width = video.videoWidth || 512
      const height = video.videoHeight || 512
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vAny = video as any
      if (typeof vAny.requestVideoFrameCallback !== 'function' || duration < 0.3) {
        cleanup()
        resolve({ width, height, duration, sourceFps: 30 })
        return
      }

      let firstMediaTime: number | null = null
      let frameCount = 0
      let done = false

      const finish = (fps: number) => {
        if (done) return
        done = true
        cleanup()
        resolve({
          width,
          height,
          duration,
          sourceFps: Math.max(8, Math.min(45, Math.round(fps))),
        })
      }

      const timer = setTimeout(() => {
        if (firstMediaTime !== null && frameCount >= 2) {
          finish(frameCount / Math.max(0.1, video.currentTime - firstMediaTime))
        } else {
          finish(30)
        }
      }, 950)

      const onFrame = (_now: number, meta: { mediaTime: number }) => {
        if (done) return
        if (firstMediaTime === null) {
          firstMediaTime = meta.mediaTime
          frameCount = 0
        } else if (meta.mediaTime > firstMediaTime + 0.001) {
          frameCount += 1
          const dt = meta.mediaTime - firstMediaTime
          if (dt >= 0.35 && frameCount >= 4) {
            clearTimeout(timer)
            finish(frameCount / dt)
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

    video.onerror = () => {
      cleanup()
      reject(new Error('Could not load video in the browser.'))
    }
    video.src = objectUrl
  })
}

export async function probeMediaFile(file: File): Promise<MediaInfo> {
  const objectUrl = URL.createObjectURL(file)
  const lower = file.name.toLowerCase()
  const isGif =
    file.type === 'image/gif' ||
    lower.endsWith('.gif') ||
    file.type === 'image/webp' ||
    lower.endsWith('.webp')

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
