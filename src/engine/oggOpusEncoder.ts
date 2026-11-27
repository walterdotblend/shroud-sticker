import type { AudioTrackInfo } from './types'

const SAMPLE_RATE = 48000
const decodedAudioCache = new WeakMap<File, Promise<AudioBuffer>>()

export function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const existing = decodedAudioCache.get(file)
  if (existing) return existing

  const promise = (async () => {
    const buf = await file.arrayBuffer()
    const ctx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
    return await ctx.decodeAudioData(buf)
  })()

  promise.catch(() => decodedAudioCache.delete(file))
  decodedAudioCache.set(file, promise)
  return promise
}

export async function probeAudioSource(
  file: File,
  isFromVideo: boolean,
  buckets = 120
): Promise<AudioTrackInfo | null> {
  try {
    const decoded = await decodeAudioFile(file)
    if (!decoded || decoded.duration < 0.05 || decoded.length === 0) return null

    const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
      decoded.getChannelData(c)
    )
    const step = Math.max(1, Math.floor(decoded.length / buckets))
    const peaks: number[] = []
    let maxPeak = 0

    for (let b = 0; b < buckets; b++) {
      const start = b * step
      if (start >= decoded.length) break
      const end = Math.min(decoded.length, start + step)
      let p = 0
      for (const ch of channels) {
        for (let i = start; i < end; i += 8) {
          const v = Math.abs(ch[i])
          if (v > p) p = v
        }
      }
      peaks.push(p)
      if (p > maxPeak) maxPeak = p
    }

    // If video track is completely silent, still allow it if user explicitly uploaded audio,
    // but for auto-probed video audio ignore completely silent tracks.
    if (isFromVideo && maxPeak < 0.0005) {
      return null
    }

    const norm = maxPeak > 0.001 ? maxPeak : 1
    const normalizedPeaks = peaks.map((p) => Number((p / norm).toFixed(3)))

    return {
      name: file.name,
      duration: Number(decoded.duration.toFixed(3)),
      peaks: normalizedPeaks,
      isFromVideo,
      objectUrl: URL.createObjectURL(file),
      file,
    }
  } catch {
    return null
  }
}

// RFC 3533 Ogg CRC32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) {
      r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    }
    t[i] = r >>> 0
  }
  return t
})()

function oggCrc(bytes: Uint8Array): number {
  let c = 0
  for (let i = 0; i < bytes.length; i++) {
    c = ((c << 8) ^ CRC_TABLE[((c >>> 24) ^ bytes[i]) & 0xff]) >>> 0
  }
  return c >>> 0
}

function createOggPage(
  headerType: number,
  granule: number,
  serial: number,
  seq: number,
  packets: Uint8Array[]
): Uint8Array {
  const te = new TextEncoder()
  const lacing: number[] = []
  for (const p of packets) {
    let rem = p.length
    while (rem >= 255) {
      lacing.push(255)
      rem -= 255
    }
    lacing.push(rem)
  }

  const dataLen = packets.reduce((sum, p) => sum + p.length, 0)
  const page = new Uint8Array(27 + lacing.length + dataLen)
  const dv = new DataView(page.buffer)
  page.set(te.encode('OggS'), 0)
  page[4] = 0
  page[5] = headerType
  dv.setBigInt64(6, BigInt(granule), true)
  dv.setUint32(14, serial, true)
  dv.setUint32(18, seq, true)
  dv.setUint32(22, 0, true)
  page[26] = lacing.length
  page.set(lacing, 27)

  let offset = 27 + lacing.length
  for (const p of packets) {
    page.set(p, offset)
    offset += p.length
  }
  dv.setUint32(22, oggCrc(page), true)
  return page
}

function buildOggOpusContainer(
  packets: Uint8Array[],
  preSkip: number,
  totalSamples: number
): Uint8Array {
  const te = new TextEncoder()
  const serial = (Math.random() * 0xffffffff) >>> 0

  const head = new Uint8Array(19)
  head.set(te.encode('OpusHead'), 0)
  head[8] = 1 // version
  head[9] = 1 // mono
  new DataView(head.buffer).setUint16(10, preSkip, true)
  new DataView(head.buffer).setUint32(12, SAMPLE_RATE, true)

  const vendor = te.encode('SHROUD')
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  tags.set(te.encode('OpusTags'), 0)
  new DataView(tags.buffer).setUint32(8, vendor.length, true)
  tags.set(vendor, 12)

  const pages: Uint8Array[] = [
    createOggPage(0x02, 0, serial, 0, [head]),
    createOggPage(0x00, 0, serial, 1, [tags]),
  ]

  const finalGranule = preSkip + totalSamples
  const PER_PAGE = 50
  let seq = 2
  for (let i = 0; i < packets.length; i += PER_PAGE) {
    const group = packets.slice(i, i + PER_PAGE)
    const isLast = i + PER_PAGE >= packets.length
    const granule = isLast
      ? finalGranule
      : Math.min(finalGranule, preSkip + (i + group.length) * 960)
    pages.push(createOggPage(isLast ? 0x04 : 0x00, granule, serial, seq++, group))
  }

  const totalLen = pages.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(totalLen)
  let pos = 0
  for (const p of pages) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}

export async function encodeAudioToOggOpus(
  file: File,
  startSec: number,
  durationSec: number,
  volume = 1
): Promise<{ oggBlob: Blob; durationSec: number }> {
  if (typeof AudioEncoder === 'undefined') {
    throw new Error('Browser WebCodecs AudioEncoder is unavailable (use Chrome or Edge).')
  }

  const decoded = await decodeAudioFile(file)
  const safeStart = Math.max(0, Math.min(Math.max(0, decoded.duration - 0.1), startSec))
  const safeDur = Math.max(0.1, Math.min(10, durationSec))

  const sampleCount = Math.max(1, Math.round(safeDur * SAMPLE_RATE))
  const offline = new OfflineAudioContext(1, sampleCount, SAMPLE_RATE)
  const src = offline.createBufferSource()
  src.buffer = decoded
  if (safeDur > decoded.duration - safeStart + 0.05) {
    src.loop = true
    src.loopStart = safeStart
    src.loopEnd = decoded.duration
  }

  const gain = offline.createGain()
  gain.gain.value = Math.max(0, Math.min(2.5, volume))
  src.connect(gain)
  gain.connect(offline.destination)

  src.start(0, safeStart, safeDur)
  const rendered = await offline.startRendering()
  const pcm = rendered.getChannelData(0)

  // Soft 10ms fade-in/fade-out to prevent edge clicks
  const fadeSamples = Math.min(Math.floor(pcm.length / 2), Math.round(0.01 * SAMPLE_RATE))
  for (let i = 0; i < fadeSamples; i++) {
    const g = i / fadeSamples
    pcm[i] *= g
    pcm[pcm.length - 1 - i] *= g
  }

  const baseConfig: AudioEncoderConfig = {
    codec: 'opus',
    sampleRate: SAMPLE_RATE,
    numberOfChannels: 1,
    bitrate: 32000,
  }
  const candidates: AudioEncoderConfig[] = [
    { ...baseConfig, bitrateMode: 'variable' },
    baseConfig,
  ]

  let chosenConfig: AudioEncoderConfig | null = null
  for (const cfg of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(cfg)
      if (support.supported) {
        chosenConfig = cfg
        break
      }
    } catch {
      // try next
    }
  }
  if (!chosenConfig) {
    throw new Error('Browser does not support Opus encoding via WebCodecs.')
  }

  const packets: Uint8Array[] = []
  let description: Uint8Array | null = null
  let encodeErr: unknown = null

  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const bytes = new Uint8Array(chunk.byteLength)
      chunk.copyTo(bytes)
      packets.push(bytes)
      const desc = meta?.decoderConfig?.description
      if (!description && desc) {
        description = ArrayBuffer.isView(desc)
          ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength)
          : new Uint8Array(desc)
      }
    },
    error: (err) => {
      encodeErr = err
    },
  })

  encoder.configure(chosenConfig)
  const BLOCK = 960 * 50
  for (let i = 0; i < pcm.length; i += BLOCK) {
    const n = Math.min(BLOCK, pcm.length - i)
    const slice = new Float32Array(pcm.subarray(i, i + n))
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: SAMPLE_RATE,
      numberOfFrames: n,
      numberOfChannels: 1,
      timestamp: Math.round((i / SAMPLE_RATE) * 1e6),
      data: slice,
    })
    encoder.encode(audioData)
    audioData.close()
  }

  await encoder.flush()
  encoder.close()
  if (encodeErr) throw encodeErr

  let preSkip = 312
  if (description !== null) {
    const descBytes: Uint8Array = description
    if (descBytes.length >= 12 && String.fromCharCode(...descBytes.subarray(0, 8)) === 'OpusHead') {
      preSkip = descBytes[10] | (descBytes[11] << 8)
    }
  }

  const oggBytes = buildOggOpusContainer(packets, preSkip, pcm.length)
  return {
    oggBlob: new Blob([oggBytes.buffer as ArrayBuffer], { type: 'audio/ogg; codecs=opus' }),
    durationSec: Number(safeDur.toFixed(2)),
  }
}
