/**
 * Pure TypeScript RIFF Animated WebP Muxer (RFC 9649 / Google WebP Container Spec)
 * with embedded WhatsApp Sticker EXIF metadata chunk (TIFF tag 0x5741).
 */

interface ExtractedFrameChunks {
  bitstreamChunk: Uint8Array
  hasAlpha: boolean
}

function writeU24LE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
  buf[offset + 2] = (val >>> 16) & 0xff
}

function writeU32LE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff
  buf[offset + 1] = (val >>> 8) & 0xff
  buf[offset + 2] = (val >>> 16) & 0xff
  buf[offset + 3] = (val >>> 24) & 0xff
}

function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>>
    0
  )
}

function fourCC(buf: Uint8Array, offset: number): string {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3])
}

function writeFourCC(buf: Uint8Array, offset: number, str: string) {
  for (let i = 0; i < 4; i++) {
    buf[offset + i] = str.charCodeAt(i)
  }
}

/**
 * Builds the official WhatsApp Sticker EXIF RIFF chunk (TIFF little-endian tag 0x5741 "AW").
 */
export function buildWhatsAppExifChunk(
  packName = 'SHROUD Sticker Forge',
  publisher = 'SHROUD'
): Uint8Array {
  const metaJson = JSON.stringify({
    'sticker-pack-id': 'com.shroud.stickerforge',
    'sticker-pack-name': packName,
    'sticker-pack-publisher': publisher,
    emojis: ['🔥', '💀'],
  })
  const jsonBytes = new TextEncoder().encode(metaJson)
  const tiffHeader = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ])
  writeU32LE(tiffHeader, 14, jsonBytes.byteLength)

  const payloadSize = tiffHeader.byteLength + jsonBytes.byteLength
  const paddedSize = payloadSize + (payloadSize % 2)
  const chunk = new Uint8Array(8 + paddedSize)
  writeFourCC(chunk, 0, 'EXIF')
  writeU32LE(chunk, 4, payloadSize)
  chunk.set(tiffHeader, 8)
  chunk.set(jsonBytes, 8 + tiffHeader.byteLength)
  return chunk
}

export function extractWebpFrameSubchunks(staticWebp: Uint8Array): ExtractedFrameChunks {
  if (
    staticWebp.byteLength < 20 ||
    fourCC(staticWebp, 0) !== 'RIFF' ||
    fourCC(staticWebp, 8) !== 'WEBP'
  ) {
    throw new Error('Invalid static WebP frame header')
  }

  let offset = 12
  let alphChunk: Uint8Array | null = null
  let imageChunk: Uint8Array | null = null
  let hasAlpha = false

  while (offset + 8 <= staticWebp.byteLength) {
    const tag = fourCC(staticWebp, offset)
    const size = readU32LE(staticWebp, offset + 4)
    const paddedSize = size + (size % 2)
    const chunkTotal = 8 + paddedSize

    if (offset + 8 + size > staticWebp.byteLength) break

    if (tag === 'VP8X') {
      const flags = staticWebp[offset + 8]
      if (flags & 0x10) hasAlpha = true
    } else if (tag === 'ALPH') {
      hasAlpha = true
      alphChunk = new Uint8Array(chunkTotal)
      alphChunk.set(staticWebp.subarray(offset, Math.min(staticWebp.byteLength, offset + chunkTotal)))
    } else if (tag === 'VP8 ' || tag === 'VP8L') {
      if (tag === 'VP8L') {
        if (offset + 12 < staticWebp.byteLength && (staticWebp[offset + 12] & 0x10) !== 0) {
          hasAlpha = true
        }
      }
      imageChunk = new Uint8Array(chunkTotal)
      imageChunk.set(staticWebp.subarray(offset, Math.min(staticWebp.byteLength, offset + chunkTotal)))
    }

    offset += chunkTotal
  }

  if (!imageChunk) {
    throw new Error('Static WebP frame missing VP8/VP8L bitstream')
  }

  if (alphChunk) {
    const combined = new Uint8Array(alphChunk.byteLength + imageChunk.byteLength)
    combined.set(alphChunk, 0)
    combined.set(imageChunk, alphChunk.byteLength)
    return { bitstreamChunk: combined, hasAlpha: true }
  }

  return { bitstreamChunk: imageChunk, hasAlpha }
}

export interface AnimatedWebpFrameInput {
  webpBytes: Uint8Array
  durationMs: number
}

export function muxAnimatedWebp(
  frames: AnimatedWebpFrameInput[],
  width: number,
  height: number
): Uint8Array {
  if (frames.length === 0) {
    throw new Error('Cannot mux 0 frames into Animated WebP')
  }

  const extracted = frames.map((f) => ({
    ...extractWebpFrameSubchunks(f.webpBytes),
    durationMs: Math.max(10, Math.min(10000, Math.round(f.durationMs))),
  }))

  const anyAlpha = extracted.some((e) => e.hasAlpha)

  const anmfChunks: Uint8Array[] = extracted.map((e) => {
    const payloadSize = 16 + e.bitstreamChunk.byteLength
    const paddedPayloadSize = payloadSize + (payloadSize % 2)
    const chunk = new Uint8Array(8 + paddedPayloadSize)

    writeFourCC(chunk, 0, 'ANMF')
    writeU32LE(chunk, 4, payloadSize)
    writeU24LE(chunk, 8, 0)
    writeU24LE(chunk, 11, 0)
    writeU24LE(chunk, 14, width - 1)
    writeU24LE(chunk, 17, height - 1)
    writeU24LE(chunk, 20, e.durationMs)
    // Flags: bit 1 (0x02) = Do not blend, bit 0 (0x01) = Dispose to background
    chunk[23] = 0x03

    chunk.set(e.bitstreamChunk, 24)
    return chunk
  })

  const exifChunk = buildWhatsAppExifChunk()
  const anmfTotalBytes = anmfChunks.reduce((acc, c) => acc + c.byteLength, 0)
  const riffPayloadSize = 4 + 18 + 14 + anmfTotalBytes + exifChunk.byteLength
  const out = new Uint8Array(8 + riffPayloadSize)

  writeFourCC(out, 0, 'RIFF')
  writeU32LE(out, 4, riffPayloadSize)
  writeFourCC(out, 8, 'WEBP')

  // VP8X (0x02 Animation | 0x08 EXIF | 0x10 Alpha)
  writeFourCC(out, 12, 'VP8X')
  writeU32LE(out, 16, 10)
  out[20] = 0x02 | 0x08 | (anyAlpha ? 0x10 : 0x00)
  writeU24LE(out, 24, width - 1)
  writeU24LE(out, 27, height - 1)

  // ANIM
  writeFourCC(out, 30, 'ANIM')
  writeU32LE(out, 34, 6)
  writeU32LE(out, 38, 0)
  out[42] = 0
  out[43] = 0

  let pos = 44
  for (const c of anmfChunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  out.set(exifChunk, pos)

  return out
}
