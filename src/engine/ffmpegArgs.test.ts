import { describe, expect, it } from 'vitest'
import {
  buildStickerArgs,
  buildStickerFilterGraph,
  computeEffectiveDuration,
  parseFfmpegDuration,
  parseFfmpegTime,
  planAutoCompressSteps,
} from './ffmpegArgs'
import { WHATSAPP_SAFE_TARGET_BYTES, type StickerSettings } from './types'
import { normalizeMediaUrl } from './urlLoader'

const baseSettings: StickerSettings = {
  trimStart: 0,
  trimEnd: 4,
  speed: 1,
  reverse: false,
  crop: null,
  fitMode: 'contain-transparent',
  targetSize: 512,
  fps: 15,
  quality: 75,
  compressionLevel: 4,
  autoCompressWhatsApp: true,
  maxBytes: WHATSAPP_SAFE_TARGET_BYTES,
}

describe('ffmpegArgs', () => {
  it('parses ffmpeg duration and time lines', () => {
    expect(parseFfmpegDuration('Duration: 00:01:23.45, start: 0.000000')).toBeCloseTo(83.45, 2)
    expect(parseFfmpegDuration('no duration here')).toBeNull()
    expect(parseFfmpegTime('frame=  42 fps=25 q=75.0 size= 128kB time=00:00:02.50 bitrate=419.4kbits/s')).toBeCloseTo(
      2.5,
      2
    )
  })

  it('computes effective duration with speed', () => {
    expect(computeEffectiveDuration(1, 5, 2)).toBeCloseTo(2, 2)
    expect(computeEffectiveDuration(0, 3, 0.5)).toBeCloseTo(6, 2)
  })

  it('builds transparent contain filter graph with crop and speed', () => {
    const vf = buildStickerFilterGraph(
      {
        ...baseSettings,
        speed: 2,
        reverse: true,
        crop: { x: 10, y: 20, width: 301, height: 301 },
      },
      640,
      480
    )
    expect(vf).toContain('setpts=0.5000*PTS')
    expect(vf).toContain('reverse')
    // Even dimensions clamped
    expect(vf).toContain('crop=300:300:10:20')
    expect(vf).toContain('fps=15')
    expect(vf).toContain('format=rgba')
    expect(vf).toContain('pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000')
  })

  it('builds libwebp args with infinite loop and no audio', () => {
    const args = buildStickerArgs('input.mp4', 'sticker.webp', { ...baseSettings, trimStart: 1.5, trimEnd: 5.5 }, 500, 500)
    expect(args).toContain('-ss')
    expect(args).toContain('1.500')
    expect(args).toContain('-t')
    expect(args).toContain('4.000')
    expect(args).toContain('libwebp')
    expect(args).toContain('-loop')
    expect(args).toContain('0')
    expect(args).toContain('-an')
  })

  it('plans progressive auto-compress steps', () => {
    const steps = planAutoCompressSteps(15, 75)
    expect(steps[0]).toEqual({ fps: 15, quality: 75, compressionLevel: 4 })
    expect(steps[steps.length - 1].fps).toBeLessThan(15)
    expect(steps[steps.length - 1].quality).toBeLessThan(75)
  })

  it('normalizes imgur gifv URLs to mp4', () => {
    expect(normalizeMediaUrl('https://i.imgur.com/abc123.gifv')).toBe('https://i.imgur.com/abc123.mp4')
  })
})
