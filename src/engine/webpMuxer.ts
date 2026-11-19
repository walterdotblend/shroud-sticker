/**
 * Pure TypeScript RIFF Animated WebP Muxer (RFC 9649 / Google WebP Container Spec).
 * Combines individual static WebP frames (from HTML5 canvas.toBlob('image/webp'))
 * into a spec-compliant 512x512 RGBA Animated WebP (VP8X + ANIM + ANMF) in <5ms,
 * eliminating the 32 MB FFmpeg.wasm download and Web Worker deadlocks.
 */

interface ExtractedFrameChunks {
  bitstreamChunk: Uint8Array // Full 'ALPH' (if any) + 'VP8 ' or 'VP8L' chunk bytes (even-padded)
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
        // VP8L header byte 4 bit 4 indicates alpha
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

  // Build ANMF chunks
  const anmfChunks: Uint8Array[] = extracted.map((e) => {
    const payloadSize = 16 + e.bitstreamChunk.byteLength
    const paddedPayloadSize = payloadSize + (payloadSize % 2)
    const chunk = new Uint8Array(8 + paddedPayloadSize)

    writeFourCC(chunk, 0, 'ANMF')
    writeU32LE(chunk, 4, payloadSize)
    // Frame X = 0, Frame Y = 0
    writeU24LE(chunk, 8, 0)
    writeU24LE(chunk, 11, 0)
    // Width - 1, Height - 1
    writeU24LE(chunk, 14, width - 1)
    writeU24LE(chunk, 17, height - 1)
    // Duration ms
    writeU24LE(chunk, 20, e.durationMs)
    // Flags: bit 1 (0x02) = Do not blend, bit 0 (0x01) = Dispose to background (0x00000000)
    chunk[23] = 0x03

    chunk.set(e.bitstreamChunk, 24)
    return chunk
  })

  // VP8X chunk: 8 + 10 = 18 bytes
  // ANIM chunk: 8 + 6 = 14 bytes
  const anmfTotalBytes = anmfChunks.reduce((acc, c) => acc + c.byteLength, 0)
  const riffPayloadSize = 4 + 18 + 14 + anmfTotalBytes // 'WEBP' (4) + VP8X (18) + ANIM (14) + ANMFs
  const out = new Uint8Array(8 + riffPayloadSize)

  writeFourCC(out, 0, 'RIFF')
  writeU32LE(out, 4, riffPayloadSize)
  writeFourCC(out, 8, 'WEBP')

  // VP8X
  writeFourCC(out, 12, 'VP8X')
  writeU32LE(out, 16, 10)
  out[20] = 0x02 | (anyAlpha ? 0x10 : 0x00) // Animation + Alpha
  writeU24LE(out, 24, width - 1)
  writeU24LE(out, 27, height - 1)

  // ANIM
  writeFourCC(out, 30, 'ANIM')
  writeU32LE(out, 34, 6)
  // Background color BGRA = 0,0,0,0; Loop count = 0 (infinite)
  writeU32LE(out, 38, 0)
  out[42] = 0
  out[43] = 0

  let pos = 44
  for (const c of anmfChunks) {
    out.set(c, pos)
    pos += c.byteLength
  }

  return out
}
