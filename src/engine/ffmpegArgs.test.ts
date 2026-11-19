import { describe, expect, it } from 'vitest'
import {
  buildStickerArgs,
  buildStickerFilterComplex,
  computeBaseFitSize,
  computeEffectiveDuration,
  parseFfmpegDuration,
  parseFfmpegTime,
  planAutoCompressSteps,
} from './ffmpegArgs'
import { WHATSAPP_SAFE_TARGET_BYTES, type StickerSettings } from './types'
import { extractMediaUrlFromHtml, isSocialVideoPage, normalizeMediaUrl } from './urlLoader'

const baseSettings: StickerSettings = {
  trimStart: 0,
  trimEnd: 4,
  speed: 1,
  reverse: false,
  crop: null,
  fitMode: 'contain-transparent',
  canvasBg: 'transparent',
  canvasScale: 1,
  canvasX: 0,
  canvasY: 0,
  rotationDeg: 0,
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

  it('builds transparent 512x512 filter_complex with scale, rotation, and speed', () => {
    const fc = buildStickerFilterComplex(
      {
        ...baseSettings,
        speed: 2,
        reverse: true,
        canvasScale: 0.6,
        canvasX: 20,
        canvasY: -15,
        rotationDeg: 30,
      },
      640,
      480
    )
    expect(computeBaseFitSize(640, 480, 512)).toEqual({ width: 512, height: 384 })
    expect(fc).toContain('color=c=black@0.0:s=512x512')
    expect(fc).toContain('setpts=0.5000*PTS')
    expect(fc).toContain('reverse')
    expect(fc).toContain('fps=15')
    expect(fc).toContain('format=rgba')
    expect(fc).toContain('rotate=')
    expect(fc).toContain("overlay=x='(W-w)/2+20':y='(H-h)/2-15':shortest=1")
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

  it('normalizes imgur gifv and giphy page URLs', () => {
    expect(normalizeMediaUrl('https://i.imgur.com/abc123.gifv')).toBe('https://i.imgur.com/abc123.mp4')
    expect(normalizeMediaUrl('https://giphy.com/gifs/funny-cat-3o7abKhOpu0NwenH3O')).toBe(
      'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.mp4'
    )
  })

  it('extracts og:video and tenor mp4 from HTML pages', () => {
    const html = '<meta property="og:video" content="https://media.tenor.com/xyz/test.mp4" />'
    expect(extractMediaUrlFromHtml(html, 'https://tenor.com/view/test-123')).toBe(
      'https://media.tenor.com/xyz/test.mp4'
    )
    expect(isSocialVideoPage('https://www.youtube.com/shorts/abc123')).toBe(true)
    expect(isSocialVideoPage('https://example.com/file.gif')).toBe(false)
  })
})
