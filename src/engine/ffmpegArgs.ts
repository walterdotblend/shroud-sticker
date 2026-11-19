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
  const safeSpeed = Math.max(0.1, Math.min(8, speed))
  return raw / safeSpeed
}

export function computeMaxAllowedQuality(fps: number, durationSec: number): number {
  // Higher FPS * duration consumes more of the 500 KB WhatsApp budget, so cap max quality dynamically
  const totalFrames = Math.max(8, fps * Math.max(0.5, durationSec))
  const penalty = Math.max(0, totalFrames - 45) * 0.42
  return Math.max(20, Math.min(95, Math.round(95 - penalty)))
}

export function computeBaseFitSize(sourceWidth: number, sourceHeight: number, canvasSize = 512): { width: number; height: number } {
  const sw = Math.max(1, sourceWidth)
  const sh = Math.max(1, sourceHeight)
  const ratio = Math.min(canvasSize / sw, canvasSize / sh)
  return {
    width: Math.max(2, Math.round(sw * ratio)),
    height: Math.max(2, Math.round(sh * ratio)),
  }
}

export function buildStickerFilterComplex(
  settings: StickerSettings,
  sourceWidth: number,
  sourceHeight: number,
  overrideFps?: number
): string {
  const size = settings.targetSize || 512
  const fps = Math.max(5, Math.min(30, Math.round(overrideFps ?? settings.fps)))
  const fgFilters: string[] = []

  if (Math.abs(settings.speed - 1) > 0.01) {
    const ptsFactor = (1 / Math.max(0.1, Math.min(8, settings.speed))).toFixed(4)
    fgFilters.push(`setpts=${ptsFactor}*PTS`)
  }

  if (settings.reverse) {
    fgFilters.push('reverse')
  }

  let effW = Math.max(2, sourceWidth)
  let effH = Math.max(2, sourceHeight)
  if (settings.crop && sourceWidth > 0 && sourceHeight > 0) {
    const cx = Math.max(0, Math.min(sourceWidth - 2, Math.round(settings.crop.x)))
    const cy = Math.max(0, Math.min(sourceHeight - 2, Math.round(settings.crop.y)))
    const cw = Math.max(2, Math.min(sourceWidth - cx, Math.round(settings.crop.width)))
    const ch = Math.max(2, Math.min(sourceHeight - cy, Math.round(settings.crop.height)))
    effW = cw % 2 === 0 ? cw : Math.max(2, cw - 1)
    effH = ch % 2 === 0 ? ch : Math.max(2, ch - 1)
    fgFilters.push(`crop=${effW}:${effH}:${cx}:${cy}`)
  }

  fgFilters.push(`fps=${fps}`)
  fgFilters.push('format=rgba')

  const base = computeBaseFitSize(effW, effH, size)
  const scale = Math.max(0.15, Math.min(3.0, settings.canvasScale || 1))
  let drawW = Math.max(4, Math.round(base.width * scale))
  let drawH = Math.max(4, Math.round(base.height * scale))
  if (drawW % 2 !== 0) drawW += 1
  if (drawH % 2 !== 0) drawH += 1

  const cursed = Math.max(0, Math.min(100, settings.cursedLevel || 0))
  if (cursed >= 35) {
    // Crunchy pixel-fry downscale + nearest-neighbor upscale for comedic ugly effect
    const factor = Math.max(0.14, 1 - (cursed / 100) * 0.82)
    let lowW = Math.max(24, Math.round(drawW * factor))
    let lowH = Math.max(24, Math.round(drawH * factor))
    if (lowW % 2 !== 0) lowW += 1
    if (lowH % 2 !== 0) lowH += 1
    fgFilters.push(`scale=${lowW}:${lowH}:flags=neighbor`)
    fgFilters.push(`scale=${drawW}:${drawH}:flags=neighbor`)
  } else {
    fgFilters.push(`scale=${drawW}:${drawH}:flags=lanczos`)
  }

  if (cursed >= 15) {
    const contrast = (1 + (cursed / 100) * 0.75).toFixed(2)
    const sat = (1 + (cursed / 100) * 1.1).toFixed(2)
    fgFilters.push(`eq=contrast=${contrast}:saturation=${sat}`)
  }

  if (Math.abs(settings.rotationDeg) > 0.1) {
    const rad = ((settings.rotationDeg * Math.PI) / 180).toFixed(5)
    fgFilters.push(`rotate=${rad}:c=0x00000000:ow='rotw(${rad})':oh='roth(${rad})'`)
  }

  const bgColor = settings.canvasBg === 'obsidian' ? '0x080709ff' : 'black@0.0'
  const ox = Math.round(settings.canvasX || 0)
  const oy = Math.round(settings.canvasY || 0)
  const xExpr = ox >= 0 ? `(W-w)/2+${ox}` : `(W-w)/2${ox}`
  const yExpr = oy >= 0 ? `(H-h)/2+${oy}` : `(H-h)/2${oy}`

  return `color=c=${bgColor}:s=${size}x${size}:r=${fps},format=rgba[bg];[0:v]${fgFilters.join(',')}[fg];[bg][fg]overlay=x='${xExpr}':y='${yExpr}':shortest=1:format=auto`
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
  const args: string[] = ['-threads', '0']
  const trimDuration = Math.max(0.1, settings.trimEnd - settings.trimStart)

  if (settings.trimStart > 0.02) {
    args.push('-ss', settings.trimStart.toFixed(3))
  }
  args.push('-i', inputName)
  args.push('-t', trimDuration.toFixed(3))

  const fc = buildStickerFilterComplex(settings, sourceWidth, sourceHeight, overrideFps)
  const cursed = Math.max(0, Math.min(100, settings.cursedLevel || 0))
  const rawQuality = overrideQuality ?? settings.quality
  const cursedQuality = cursed > 0 ? Math.max(3, Math.round(rawQuality * (1 - (cursed / 100) * 0.88))) : rawQuality
  const quality = Math.max(3, Math.min(95, Math.round(cursedQuality)))
  const compression = Math.max(0, Math.min(6, Math.round(overrideCompression ?? settings.compressionLevel)))

  args.push(
    '-filter_complex',
    fc,
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

  const steps: CompressStep[] = [{ fps: startFps, quality: startQ, compressionLevel: 3 }]

  const qualityLadder = [60, 46, 34, 24, 15].filter((q) => q < startQ)
  for (const q of qualityLadder) {
    steps.push({ fps: startFps, quality: q, compressionLevel: 5 })
  }

  const fpsLadder = [12, 10, 8].filter((f) => f < startFps)
  for (const f of fpsLadder) {
    steps.push({ fps: f, quality: 28, compressionLevel: 6 })
    steps.push({ fps: f, quality: 16, compressionLevel: 6 })
  }

  return steps
}
