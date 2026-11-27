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
  return Math.min(10, raw / safeSpeed)
}

export function computeMaxAllowedQuality(
  fps: number,
  durationSec: number,
  removeBg = false
): number {
  // Higher FPS * duration consumes more of the 500 KB WhatsApp budget.
  // When AI background removal is active, lossless ALPH chunks take extra bytes,
  // so cap max initial quality lower to preserve the user's selected FPS.
  const totalFrames = Math.max(8, fps * Math.max(0.5, durationSec))
  const rate = removeBg ? 0.68 : 0.42
  const baseCeiling = removeBg ? 75 : 95
  const threshold = removeBg ? 25 : 45
  const penalty = Math.max(0, totalFrames - threshold) * rate
  return Math.max(15, Math.min(baseCeiling, Math.round(baseCeiling - penalty)))
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

export function buildStickerFilterGraph(
  settings: StickerSettings,
  sourceWidth: number,
  sourceHeight: number,
  overrideFps?: number
): string {
  const size = settings.targetSize || 512
  const fps = Math.max(5, Math.min(45, Math.round(overrideFps ?? settings.fps)))
  const filters: string[] = []

  if (Math.abs(settings.speed - 1) > 0.01) {
    const ptsFactor = (1 / Math.max(0.1, Math.min(8, settings.speed))).toFixed(4)
    filters.push(`setpts=${ptsFactor}*PTS`)
  }

  if (settings.reverse) {
    filters.push('reverse')
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
    filters.push(`crop=${effW}:${effH}:${cx}:${cy}`)
  }

  filters.push(`fps=${fps}`)
  filters.push('format=rgba')

  const base = computeBaseFitSize(effW, effH, size)
  const scale = Math.max(0.1, Math.min(20.0, settings.canvasScale || 1))
  let drawW = Math.max(4, Math.round(base.width * scale))
  let drawH = Math.max(4, Math.round(base.height * scale))
  if (drawW % 2 !== 0) drawW += 1
  if (drawH % 2 !== 0) drawH += 1

  const cursed = Math.max(0, Math.min(100, settings.cursedLevel || 0))
  if (cursed >= 35) {
    const factor = Math.max(0.14, 1 - (cursed / 100) * 0.82)
    let lowW = Math.max(24, Math.round(drawW * factor))
    let lowH = Math.max(24, Math.round(drawH * factor))
    if (lowW % 2 !== 0) lowW += 1
    if (lowH % 2 !== 0) lowH += 1
    filters.push(`scale=${lowW}:${lowH}:flags=neighbor`)
    filters.push(`scale=${drawW}:${drawH}:flags=neighbor`)
  } else {
    filters.push(`scale=${drawW}:${drawH}:flags=lanczos`)
  }

  if (cursed >= 15) {
    const contrast = (1 + (cursed / 100) * 0.75).toFixed(2)
    const sat = (1 + (cursed / 100) * 1.1).toFixed(2)
    filters.push(`eq=contrast=${contrast}:saturation=${sat}`)
  }

  if (settings.flipH) {
    filters.push('hflip')
  }

  if (Math.abs(settings.rotationDeg) > 0.1) {
    const rad = ((settings.rotationDeg * Math.PI) / 180).toFixed(5)
    filters.push(`rotate=${rad}:c=0x00000000:ow='rotw(${rad})':oh='roth(${rad})'`)
  }

  const bgColor = settings.canvasBg === 'obsidian' ? '0x080709ff' : '0x00000000'
  const ox = Math.round(settings.canvasX || 0)
  const oy = Math.round(settings.canvasY || 0)
  const absOx = Math.abs(ox)
  const absOy = Math.abs(oy)
  const xExpr = ox >= 0 ? `(ow-iw)/2+${ox}` : `(ow-iw)/2${ox}`
  const yExpr = oy >= 0 ? `(oh-ih)/2+${oy}` : `(oh-ih)/2${oy}`

  filters.push(
    `pad=w='max(${size},iw+${absOx * 2}+4)':h='max(${size},ih+${absOy * 2}+4)':x='${xExpr}':y='${yExpr}':color=${bgColor}`
  )
  filters.push(`crop=${size}:${size}:(iw-${size})/2:(ih-${size})/2`)

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
  overrideCompression?: number,
  targetDurationSec?: number
): string[] {
  const args: string[] = []
  const trimDuration = Math.max(0.1, settings.trimEnd - settings.trimStart)
  const effectiveBase = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)
  const finalDuration = targetDurationSec && targetDurationSec > effectiveBase ? targetDurationSec : effectiveBase
  const isLooped = finalDuration > effectiveBase + 0.05

  if (isLooped) {
    args.push('-stream_loop', '-1')
  }
  if (settings.trimStart > 0.02) {
    args.push('-ss', settings.trimStart.toFixed(3))
  }
  args.push('-i', inputName)
  args.push('-t', (isLooped ? finalDuration : trimDuration).toFixed(3))

  const vf = buildStickerFilterGraph(settings, sourceWidth, sourceHeight, overrideFps)
  const cursed = Math.max(0, Math.min(100, settings.cursedLevel || 0))
  const rawQuality = overrideQuality ?? settings.quality
  const cursedQuality = cursed > 0 ? Math.max(3, Math.round(rawQuality * (1 - (cursed / 100) * 0.88))) : rawQuality
  const quality = Math.max(3, Math.min(95, Math.round(cursedQuality)))
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
  const startFps = Math.max(8, Math.min(45, Math.round(initialFps)))
  const startQ = Math.max(5, Math.min(95, Math.round(initialQuality)))

  return [
    { fps: startFps, quality: startQ, compressionLevel: 1 },
    { fps: startFps, quality: Math.max(8, Math.round(startQ * 0.45)), compressionLevel: 2 },
    { fps: Math.max(8, Math.round(startFps * 0.65)), quality: 12, compressionLevel: 3 },
  ]
}
