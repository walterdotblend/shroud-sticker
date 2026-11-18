import type { StickerSettings } from './types'

/**
 * Duration & timestamp parsers adapted from ArrowBrake (Arroxy/src/main/services/phases/EncodePhase.ts).
 */
export function parseFfmpegDuration(line: string): number | null {
  const match = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const total = hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) && total > 0 ? total : null
}

export function parseFfmpegTime(line: string): number | null {
  const match = /time=(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  const total = hours * 3600 + minutes * 60 + seconds
  return Number.isFinite(total) && total >= 0 ? total : null
}

export function computeEffectiveDuration(trimStart: number, trimEnd: number, speed: number): number {
  const raw = Math.max(0.1, trimEnd - trimStart)
  const safeSpeed = Math.max(0.25, Math.min(4, speed))
  return raw / safeSpeed
}

export function buildStickerFilterGraph(
  settings: StickerSettings,
  sourceWidth: number,
  sourceHeight: number,
  overrideFps?: number
): string {
  const filters: string[] = []
  const size = settings.targetSize || 512
  const fps = Math.max(5, Math.min(30, Math.round(overrideFps ?? settings.fps)))

  // 1. Speed adjustment (setpts)
  if (Math.abs(settings.speed - 1) > 0.01) {
    const ptsFactor = (1 / Math.max(0.25, Math.min(4, settings.speed))).toFixed(4)
    filters.push(`setpts=${ptsFactor}*PTS`)
  }

  // 2. Optional reverse (safe for short sticker clips)
  if (settings.reverse) {
    filters.push('reverse')
  }

  // 3. Crop (in source pixel coordinates, clamped to valid bounds)
  if (settings.crop && sourceWidth > 0 && sourceHeight > 0) {
    const cx = Math.max(0, Math.min(sourceWidth - 2, Math.round(settings.crop.x)))
    const cy = Math.max(0, Math.min(sourceHeight - 2, Math.round(settings.crop.y)))
    const cw = Math.max(2, Math.min(sourceWidth - cx, Math.round(settings.crop.width)))
    const ch = Math.max(2, Math.min(sourceHeight - cy, Math.round(settings.crop.height)))
    // Ensure even dimensions for libwebp/yuv compatibility
    const evenW = cw % 2 === 0 ? cw : Math.max(2, cw - 1)
    const evenH = ch % 2 === 0 ? ch : Math.max(2, ch - 1)
    filters.push(`crop=${evenW}:${evenH}:${cx}:${cy}`)
  }

  // 4. FPS cap
  filters.push(`fps=${fps}`)

  // 5. Resize & Fit to 512x512
  switch (settings.fitMode) {
    case 'contain-transparent':
      filters.push('format=rgba')
      filters.push(`scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`)
      filters.push(`pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`)
      break
    case 'contain-dark':
      filters.push('format=rgba')
      filters.push(`scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=lanczos`)
      filters.push(`pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=#080709ff`)
      break
    case 'cover':
      filters.push('format=rgba')
      filters.push(`scale=${size}:${size}:force_original_aspect_ratio=increase:flags=lanczos`)
      filters.push(`crop=${size}:${size}`)
      break
    case 'stretch':
      filters.push('format=rgba')
      filters.push(`scale=${size}:${size}:flags=lanczos`)
      break
  }

  return filters.join(',')
}

export function buildStickerArgs(
  inputName: string,
  outputName: string,
  settings: StickerSettings,
  sourceWidth: number,
  sourceHeight: number,
  overrideQuality?: number,
  overrideFps?: number,
  overrideCompression?: number
): string[] {
  const args: string[] = []
  const trimDuration = Math.max(0.1, settings.trimEnd - settings.trimStart)

  // Input seek & trim
  if (settings.trimStart > 0.02) {
    args.push('-ss', settings.trimStart.toFixed(3))
  }
  args.push('-i', inputName)
  args.push('-t', trimDuration.toFixed(3))

  const vf = buildStickerFilterGraph(settings, sourceWidth, sourceHeight, overrideFps)
  const quality = Math.max(5, Math.min(100, Math.round(overrideQuality ?? settings.quality)))
  const compression = Math.max(0, Math.min(6, Math.round(overrideCompression ?? settings.compressionLevel)))

  args.push(
    '-vf',
    vf,
    '-an',
    '-vcodec',
    'libwebp',
    '-lossless',
    '0',
    '-compression_level',
    String(compression),
    '-q:v',
    String(quality),
    '-loop',
    '0',
    '-preset',
    'default',
    '-y',
    outputName
  )

  return args
}

export interface CompressStep {
  fps: number
  quality: number
  compressionLevel: number
}

/**
 * Generates an adaptive multi-pass compression schedule so the resulting
 * animated WebP fits under WhatsApp's 500 KB limit with minimal quality loss.
 */
export function planAutoCompressSteps(initialFps: number, initialQuality: number): CompressStep[] {
  const startFps = Math.max(8, Math.min(30, Math.round(initialFps)))
  const startQ = Math.max(15, Math.min(95, Math.round(initialQuality)))

  const steps: CompressStep[] = [{ fps: startFps, quality: startQ, compressionLevel: 4 }]

  const qualityLadder = [60, 46, 34, 24, 15].filter((q) => q < startQ)
  for (const q of qualityLadder) {
    steps.push({ fps: startFps, quality: q, compressionLevel: 5 })
  }

  // If still too large at low quality, step down FPS
  const fpsLadder = [12, 10, 8].filter((f) => f < startFps)
  for (const f of fpsLadder) {
    steps.push({ fps: f, quality: 28, compressionLevel: 6 })
    steps.push({ fps: f, quality: 16, compressionLevel: 6 })
  }

  return steps
}
