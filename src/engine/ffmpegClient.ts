import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import {
  buildStickerArgs,
  computeEffectiveDuration,
  parseFfmpegTime,
  planAutoCompressSteps,
} from './ffmpegArgs'
import { encodeStickerNative } from './nativeWebpEncoder'
import type { EncodePassLog, EncodeResult, MediaInfo, StickerSettings } from './types'
import { WHATSAPP_MAX_BYTES } from './types'

const CORE_VERSION = '0.12.6'
const CORE_SOURCES = [
  `${import.meta.env.BASE_URL}ffmpeg`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
]

export interface EngineCallbacks {
  onLog: (line: string) => void
  onProgress: (ratio: number, statusText: string) => void
}

class StickerFfmpegEngine {
  private ffmpeg: FFmpeg | null = null
  private loadPromise: Promise<FFmpeg> | null = null

  async ensureLoaded(onLog?: (line: string) => void): Promise<FFmpeg> {
    if (this.ffmpeg && this.ffmpeg.loaded) return this.ffmpeg
    if (this.loadPromise) return this.loadPromise

    this.loadPromise = (async () => {
      const ff = new FFmpeg()
      let lastError: unknown = null

      for (const baseUrl of CORE_SOURCES) {
        try {
          const label = baseUrl.startsWith('http')
            ? baseUrl.includes('jsdelivr')
              ? 'jsDelivr'
              : 'unpkg'
            : 'local'
          onLog?.(`> Initializing FFmpeg.wasm core (${label})...`)
          const coreURL = await toBlobURL(`${baseUrl}/ffmpeg-core.js`, 'text/javascript')
          const wasmURL = await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm')
          await ff.load({ coreURL, wasmURL })
          this.ffmpeg = ff
          onLog?.('> FFmpeg.wasm core ready (100% local in browser).')
          return ff
        } catch (err) {
          lastError = err
          onLog?.(`! Mirror ${baseUrl} failed, trying backup...`)
        }
      }

      this.loadPromise = null
      throw new Error(`Failed to load FFmpeg.wasm: ${String(lastError)}`)
    })()

    return this.loadPromise
  }

  async encodeSticker(
    media: MediaInfo,
    settings: StickerSettings,
    callbacks: EngineCallbacks
  ): Promise<EncodeResult> {
    try {
      return await encodeStickerNative(media, settings, callbacks)
    } catch (nativeErr) {
      callbacks.onLog(`> Native fast path fallback (${String(nativeErr)}), switching to FFmpeg.wasm...`)
    }

    const ff = await this.ensureLoaded(callbacks.onLog)
    const ext = media.name.split('.').pop()?.toLowerCase() || (media.isGif ? 'gif' : 'mp4')
    const inputName = `input.${ext}`
    const outputName = 'sticker.webp'

    const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)

    let currentPass = 1
    let currentPassExpectedFrames = Math.max(1, Math.round(effectiveDuration * settings.fps))

    const reportPassRatio = (passRatio: number, detail: string) => {
      const clamped = Math.max(0, Math.min(1, passRatio))
      const barRatio = 0.08 + clamped * 0.88
      callbacks.onProgress(barRatio, `[Pass ${currentPass}] ${detail} (${Math.round(clamped * 100)}%)`)
    }

    const progressListener = ({ progress }: { progress: number }) => {
      if (!Number.isFinite(progress) || progress <= 0) return
      reportPassRatio(progress, 'Forging WebP...')
    }

    const logListener = ({ message }: { message: string }) => {
      const t = parseFfmpegTime(message)
      const frameMatch = /frame=\s*(\d+)/.exec(message)
      if (t !== null && effectiveDuration > 0) {
        reportPassRatio(t / effectiveDuration, 'Forging WebP...')
      } else if (frameMatch) {
        const frames = Number(frameMatch[1])
        reportPassRatio(frames / currentPassExpectedFrames, `Frame ${frames}/${currentPassExpectedFrames}`)
      }
      if (message.includes('frame=') || message.includes('Output #0') || message.includes('Error')) {
        callbacks.onLog(message)
      }
    }

    ff.on('progress', progressListener)
    ff.on('log', logListener)

    try {
      callbacks.onProgress(0.04, 'Loading file into WASM memory...')
      await ff.writeFile(inputName, await fetchFile(media.file))

      const steps = settings.autoCompressWhatsApp
        ? planAutoCompressSteps(settings.fps, settings.quality)
        : [{ fps: settings.fps, quality: settings.quality, compressionLevel: 2 }]

      const passLogs: EncodePassLog[] = []
      let bestBytes: Uint8Array | null = null
      let bestStep = steps[0]

      for (let i = 0; i < steps.length; i++) {
        currentPass = i + 1
        const step = steps[i]
        currentPassExpectedFrames = Math.max(1, Math.round(effectiveDuration * step.fps))
        callbacks.onLog(
          `> Pass ${currentPass}: fps=${step.fps}, q=${step.quality}, comp=${step.compressionLevel}`
        )
        callbacks.onProgress(
          0.08,
          `Forging sticker [Pass ${currentPass}: ${step.fps}fps · q${step.quality}]...`
        )

        const args = buildStickerArgs(
          inputName,
          outputName,
          settings,
          media.width,
          media.height,
          step.quality,
          step.fps,
          step.compressionLevel
        )

        const exitCode = await ff.exec(args)
        if (exitCode !== 0) {
          throw new Error(`FFmpeg exited with code ${exitCode}.`)
        }

        const data = (await ff.readFile(outputName)) as Uint8Array
        const sizeKB = (data.byteLength / 1024).toFixed(1)
        passLogs.push({
          pass: currentPass,
          fps: step.fps,
          quality: step.quality,
          sizeBytes: data.byteLength,
        })
        callbacks.onLog(`  -> Output: ${sizeKB} KB`)

        bestBytes = data
        bestStep = step

        if (!settings.autoCompressWhatsApp || data.byteLength <= settings.maxBytes) {
          break
        }
      }

      if (!bestBytes) {
        throw new Error('No WebP output was generated.')
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
        width: settings.targetSize,
        height: settings.targetSize,
        durationSec: effectiveDuration,
        passes: passLogs,
        fpsUsed: bestStep.fps,
        qualityUsed: bestStep.quality,
        whatsappValid: blob.size <= WHATSAPP_MAX_BYTES && effectiveDuration <= 10.05,
      }
    } finally {
      ff.off('progress', progressListener)
      ff.off('log', logListener)
      try {
        await ff.deleteFile(inputName)
      } catch {
        // ignore
      }
      try {
        await ff.deleteFile(outputName)
      } catch {
        // ignore
      }
    }
  }
}

export const stickerEngine = new StickerFfmpegEngine()
