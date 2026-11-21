import { GifReader } from 'omggif'
import { applyAiBgRemovalToCanvas, ensureBgRemoverLoaded } from './bgRemover'
import {
  computeBaseFitSize,
  computeEffectiveDuration,
  planAutoCompressSteps,
} from './ffmpegArgs'
import type { EngineCallbacks } from './ffmpegClient'
import type { EncodePassLog, EncodeResult, MediaInfo, StickerSettings } from './types'
import { WHATSAPP_MAX_BYTES } from './types'
import { muxAnimatedWebp } from './webpMuxer'

interface DecodedSourceFrame {
  canvas: HTMLCanvasElement
  timeSec: number
}

function drawTransformedFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  settings: StickerSettings
): HTMLCanvasElement {
  const size = settings.targetSize || 512
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = out.getContext('2d')!

  if (settings.canvasBg === 'obsidian') {
    ctx.fillStyle = '#080709'
    ctx.fillRect(0, 0, size, size)
  } else {
    ctx.clearRect(0, 0, size, size)
  }

  const base = computeBaseFitSize(sourceWidth, sourceHeight, size)
  const scale = Math.max(0.1, Math.min(20.0, settings.canvasScale || 1))
  const drawW = Math.max(4, Math.round(base.width * scale))
  const drawH = Math.max(4, Math.round(base.height * scale))

  const cursed = Math.max(0, Math.min(100, settings.cursedLevel || 0))
  let drawSource: CanvasImageSource = source

  if (cursed >= 35) {
    const factor = Math.max(0.14, 1 - (cursed / 100) * 0.82)
    const lowW = Math.max(24, Math.round(drawW * factor))
    const lowH = Math.max(24, Math.round(drawH * factor))
    const lowCanvas = document.createElement('canvas')
    lowCanvas.width = lowW
    lowCanvas.height = lowH
    const lctx = lowCanvas.getContext('2d')!
    lctx.imageSmoothingEnabled = false
    lctx.drawImage(source, 0, 0, lowW, lowH)
    drawSource = lowCanvas
    ctx.imageSmoothingEnabled = false
  } else {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
  }

  ctx.save()
  if (cursed >= 15) {
    const contrast = (1 + (cursed / 100) * 0.75).toFixed(2)
    const sat = (1 + (cursed / 100) * 1.1).toFixed(2)
    ctx.filter = `contrast(${contrast}) saturate(${sat})`
  }

  const cx = size / 2 + (settings.canvasX || 0)
  const cy = size / 2 + (settings.canvasY || 0)
  ctx.translate(cx, cy)
  if (Math.abs(settings.rotationDeg) > 0.1) {
    ctx.rotate((settings.rotationDeg * Math.PI) / 180)
  }
  ctx.drawImage(drawSource, -drawW / 2, -drawH / 2, drawW, drawH)
  ctx.restore()

  return out
}

async function decodeGifFrames(file: File): Promise<DecodedSourceFrame[]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const reader = new GifReader(buf)
  const numFrames = reader.numFrames()
  const w = reader.width
  const h = reader.height

  const accum = new Uint8ClampedArray(w * h * 4)
  const frames: DecodedSourceFrame[] = []
  let elapsedSec = 0

  for (let i = 0; i < numFrames; i++) {
    const info = reader.frameInfo(i)
    const backup = info.disposal === 3 ? new Uint8ClampedArray(accum) : null

    reader.decodeAndBlitFrameRGBA(i, accum)

    const frameCanvas = document.createElement('canvas')
    frameCanvas.width = w
    frameCanvas.height = h
    const fctx = frameCanvas.getContext('2d')!
    const imgData = new ImageData(new Uint8ClampedArray(accum), w, h)
    fctx.putImageData(imgData, 0, 0)

    frames.push({ canvas: frameCanvas, timeSec: elapsedSec })

    const delayCs = info.delay > 1 ? info.delay : 10
    elapsedSec += delayCs / 100

    if (info.disposal === 2) {
      // Clear frame rect to transparent
      for (let y = info.y; y < info.y + info.height; y++) {
        for (let x = info.x; x < info.x + info.width; x++) {
          const idx = (y * w + x) * 4
          accum[idx] = 0
          accum[idx + 1] = 0
          accum[idx + 2] = 0
          accum[idx + 3] = 0
        }
      }
    } else if (info.disposal === 3 && backup) {
      accum.set(backup)
    }
  }

  return frames
}

async function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSec) < 0.005) return
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      video.removeEventListener('seeked', finish)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, 900)
    video.addEventListener('seeked', finish, { once: true })
    video.currentTime = timeSec
  })
}

async function canvasToWebpBytes(canvas: HTMLCanvasElement, qualityRatio: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', Math.max(0.03, Math.min(0.96, qualityRatio)))
  )
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('NATIVE_WEBP_UNSUPPORTED')
  }
  return new Uint8Array(await blob.arrayBuffer())
}

export async function encodeStickerNative(
  media: MediaInfo,
  settings: StickerSettings,
  callbacks: EngineCallbacks
): Promise<EncodeResult> {
  const size = settings.targetSize || 512
  const trimDuration = Math.max(0.1, settings.trimEnd - settings.trimStart)
  const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)
  const cursed = Math.max(0, Math.min(100, settings.cursedLevel || 0))

  callbacks.onLog('> Using Fast Native WebP Muxer (0 MB download, GPU Canvas + C++ libwebp)...')
  callbacks.onProgress(0.06, 'Extracting & rendering 512×512 frames...')

  const maxAllowedFps = Math.max(8, Math.min(30, media.sourceFps || 30))
  const baseFps = Math.max(8, Math.min(maxAllowedFps, Math.round(settings.fps)))
  const totalBaseFrames = Math.max(2, Math.min(150, Math.round(effectiveDuration * baseFps)))
  const renderedCanvases: HTMLCanvasElement[] = []

  const lower = media.name.toLowerCase()
  const isRealGif = media.file.type === 'image/gif' || lower.endsWith('.gif')

  if (isRealGif) {
    const gifFrames = await decodeGifFrames(media.file)
    if (gifFrames.length === 0) throw new Error('GIF contains 0 frames')

    for (let i = 0; i < totalBaseFrames; i++) {
      const progressIdx = settings.reverse ? totalBaseFrames - 1 - i : i
      const norm = totalBaseFrames > 1 ? progressIdx / (totalBaseFrames - 1) : 0
      const targetTime = settings.trimStart + norm * trimDuration

      // Pick closest GIF frame <= targetTime
      let chosen = gifFrames[0]
      for (const gf of gifFrames) {
        if (gf.timeSec <= targetTime + 0.005) chosen = gf
        else break
      }

      renderedCanvases.push(drawTransformedFrame(chosen.canvas, media.width, media.height, settings))
      if (i % 4 === 0) {
        const r = (i + 1) / totalBaseFrames
        callbacks.onProgress(0.06 + r * 0.44, `Rendering frame ${i + 1}/${totalBaseFrames}...`)
        await new Promise((res) => setTimeout(res, 0))
      }
    }
  } else if (media.isGif) {
    // Static or animated WebP input: load via <img>
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = media.objectUrl
    })
    renderedCanvases.push(drawTransformedFrame(img, media.width, media.height, settings))
  } else {
    // Video input (.mp4, .webm, .mov)
    const video = document.createElement('video')
    video.src = media.objectUrl
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('Failed to decode video frames'))
    })

    for (let i = 0; i < totalBaseFrames; i++) {
      const progressIdx = settings.reverse ? totalBaseFrames - 1 - i : i
      const norm = totalBaseFrames > 1 ? progressIdx / (totalBaseFrames - 1) : 0
      const targetTime = Math.min(Math.max(0, media.duration - 0.02), settings.trimStart + norm * trimDuration)

      await seekVideo(video, targetTime)
      renderedCanvases.push(drawTransformedFrame(video, media.width, media.height, settings))

      const r = (i + 1) / totalBaseFrames
      callbacks.onProgress(0.06 + r * 0.48, `Capturing frame ${i + 1}/${totalBaseFrames}...`)
    }
  }

  const steps = settings.autoCompressWhatsApp
    ? planAutoCompressSteps(baseFps, settings.quality)
    : [{ fps: baseFps, quality: settings.quality, compressionLevel: 1 }]

  // Optional 100% local AI background removal per frame (WebGPU / WASM)
  if (settings.removeBg && renderedCanvases.length > 0) {
    const loadedBg = await ensureBgRemoverLoaded(
      settings.bgModel || 'rmbg',
      callbacks.onLog,
      callbacks.onProgress
    )
    callbacks.onLog(`> Removing background on ${renderedCanvases.length} frames locally...`)
    for (let i = 0; i < renderedCanvases.length; i++) {
      await applyAiBgRemovalToCanvas(renderedCanvases[i], loadedBg)
      const r = (i + 1) / renderedCanvases.length
      callbacks.onProgress(
        0.25 + r * 0.3,
        `Removing BG (AI) frame ${i + 1}/${renderedCanvases.length}...`
      )
    }
    callbacks.onLog('> ✓ AI background removal complete.')
  }

  const passLogs: EncodePassLog[] = []
  let bestBytes: Uint8Array | null = null
  let bestStep = steps[0]

  for (let passIdx = 0; passIdx < steps.length; passIdx++) {
    const step = steps[passIdx]
    const effectiveQ =
      cursed > 0 ? Math.max(3, Math.round(step.quality * (1 - (cursed / 100) * 0.88))) : step.quality

    // Subsample cached canvases if step.fps < baseFps, preserving exact effectiveDuration
    const stepFrameCount = Math.max(1, Math.round((renderedCanvases.length * step.fps) / baseFps))
    const frameDurMs = Math.max(20, Math.round((effectiveDuration * 1000) / stepFrameCount))
    const encodedFrames: Array<{ webpBytes: Uint8Array; durationMs: number }> = []

    callbacks.onLog(`> Pass ${passIdx + 1}: fps=${step.fps}, q=${effectiveQ} (${stepFrameCount} frames)`)

    for (let fi = 0; fi < stepFrameCount; fi++) {
      const srcIdx = Math.min(
        renderedCanvases.length - 1,
        Math.floor((fi * renderedCanvases.length) / stepFrameCount)
      )
      const webpBytes = await canvasToWebpBytes(renderedCanvases[srcIdx], effectiveQ / 100)
      encodedFrames.push({ webpBytes, durationMs: frameDurMs })

      if (fi % 3 === 0 || fi === stepFrameCount - 1) {
        const encRatio = (fi + 1) / stepFrameCount
        callbacks.onProgress(
          0.54 + encRatio * 0.42,
          `[Pass ${passIdx + 1}] Forging WebP frame ${fi + 1}/${stepFrameCount}...`
        )
      }
    }

    const muxed = muxAnimatedWebp(encodedFrames, size, size)
    const sizeKB = (muxed.byteLength / 1024).toFixed(1)
    passLogs.push({
      pass: passIdx + 1,
      fps: step.fps,
      quality: effectiveQ,
      sizeBytes: muxed.byteLength,
    })
    callbacks.onLog(`  -> Output: ${sizeKB} KB`)

    bestBytes = muxed
    bestStep = { ...step, quality: effectiveQ }

    if (!settings.autoCompressWhatsApp || muxed.byteLength <= settings.maxBytes) {
      break
    }
  }

  if (!bestBytes) {
    throw new Error('Failed to generate WebP output')
  }

  const copy = new Uint8Array(bestBytes.byteLength)
  copy.set(bestBytes)
  const blob = new Blob([copy.buffer], { type: 'image/webp' })
  const url = URL.createObjectURL(blob)

  callbacks.onProgress(1, 'Sticker forged.')

  return {
    blob,
    url,
    sizeBytes: blob.size,
    width: size,
    height: size,
    durationSec: effectiveDuration,
    passes: passLogs,
    fpsUsed: bestStep.fps,
    qualityUsed: bestStep.quality,
    whatsappValid: blob.size <= WHATSAPP_MAX_BYTES && effectiveDuration <= 10.05,
  }
}
