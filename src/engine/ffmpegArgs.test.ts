import { describe, expect, it } from 'vitest'
import {
  buildStickerArgs,
  buildStickerFilterGraph,
  computeBaseFitSize,
  computeEffectiveDuration,
  computeMaxAllowedQuality,
  parseFfmpegDuration,
  parseFfmpegTime,
  planAutoCompressSteps,
} from './ffmpegArgs'
import { WHATSAPP_SAFE_TARGET_BYTES, type StickerSettings } from './types'
import { extractMediaUrlFromHtml, isSocialVideoPage, normalizeMediaUrl } from './urlLoader'
import { selectWeightedBanner } from '../components/AdBannerRail'

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
  flipH: false,
  targetSize: 512,
  fps: 15,
  quality: 75,
  cursedLevel: 0,
  removeBg: false,
  bgModel: 'rmbg',
  compressionLevel: 4,
  autoCompressWhatsApp: true,
  maxBytes: WHATSAPP_SAFE_TARGET_BYTES,
}

describe('ffmpegArgs', () => {
  it('parses ffmpeg duration and time lines', () => {
    expect(parseFfmpegDuration('Duration: 00:01:23.45, start: 0.000000')).toBeCloseTo(83.45, 2)
    expect(parseFfmpegDuration('no duration here')).toBeNull()
    expect(
      parseFfmpegTime('frame=  42 fps=25 q=75.0 size= 128kB time=00:00:02.50 bitrate=419.4kbits/s')
    ).toBeCloseTo(2.5, 2)
  })

  it('computes effective duration with speed', () => {
    expect(computeEffectiveDuration(1, 5, 2)).toBeCloseTo(2, 2)
    expect(computeEffectiveDuration(0, 3, 0.5)).toBeCloseTo(6, 2)
  })

  it('builds transparent 512x512 filter_graph with scale, rotation, and speed', () => {
    const vf = buildStickerFilterGraph(
      {
        ...baseSettings,
        speed: 2,
        reverse: true,
        canvasScale: 0.6,
        canvasX: 20,
        canvasY: -15,
        rotationDeg: 30,
        flipH: true,
      },
      640,
      480
    )
    expect(computeBaseFitSize(640, 480, 512)).toEqual({ width: 512, height: 384 })
    expect(vf).toContain('setpts=0.5000*PTS')
    expect(vf).toContain('reverse')
    expect(vf).toContain('fps=15')
    expect(vf).toContain('format=rgba')
    expect(vf).toContain('hflip')
    expect(vf).toContain('rotate=')
    expect(vf).toContain('pad=w=')
    expect(vf).toContain('crop=512:512:(iw-512)/2:(ih-512)/2')
  })

  it('builds libwebp args with infinite loop and no audio', () => {
    const args = buildStickerArgs(
      'input.mp4',
      'sticker.webp',
      { ...baseSettings, trimStart: 1.5, trimEnd: 5.5 },
      500,
      500
    )
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
    expect(steps[0]).toEqual({ fps: 15, quality: 75, compressionLevel: 1 })
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

  it('selects weighted banners per slot and language (Zylo SWRR)', () => {
    const banners = [
      { id: 'b1', name: 'Left 1', slot: 'viewer_left' as const, mediaUrl: '/a.svg', clickUrl: 'https://a.com', weight: 10 },
      { id: 'b2', name: 'Right 1', slot: 'viewer_right' as const, mediaUrl: '/b.svg', clickUrl: 'https://b.com', weight: 5 },
    ]
    expect(selectWeightedBanner(banners, 'viewer_left', 'es')?.id).toBe('b1')
    expect(selectWeightedBanner(banners, 'viewer_right', 'en')?.id).toBe('b2')
  })

  it('computes dynamic max quality lower when AI background removal is enabled', () => {
    const normalMax = computeMaxAllowedQuality(15, 4, false)
    const bgMax = computeMaxAllowedQuality(15, 4, true)
    expect(bgMax).toBeLessThan(normalMax)
  })
})
