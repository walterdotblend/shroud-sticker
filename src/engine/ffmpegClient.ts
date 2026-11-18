import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import {
  buildStickerArgs,
  computeEffectiveDuration,
  parseFfmpegTime,
  planAutoCompressSteps,
} from './ffmpegArgs'
import type { EncodePassLog, EncodeResult, MediaInfo, StickerSettings } from './types'
import { WHATSAPP_MAX_BYTES } from './types'

const CORE_VERSION = '0.12.6'
const SINGLE_THREAD_SOURCES = [
  `${import.meta.env.BASE_URL}ffmpeg`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
  `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`,
]
const MULTI_THREAD_SOURCES = [
  `${import.meta.env.BASE_URL}ffmpeg-mt`,
  `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`,
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
      const canMultiThread = typeof window !== 'undefined' && window.crossOriginIsolated === true

      if (canMultiThread) {
        for (const baseUrl of MULTI_THREAD_SOURCES) {
          try {
            const label = baseUrl.startsWith('http') ? 'CDN multi-hilo' : 'local multi-hilo'
            onLog?.(`> Inicializando FFmpeg.wasm (${label})...`)
            const coreURL = await toBlobURL(`${baseUrl}/ffmpeg-core.js`, 'text/javascript')
            const wasmURL = await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm')
            const workerURL = await toBlobURL(`${baseUrl}/ffmpeg-core.worker.js`, 'text/javascript')
            await ff.load({ coreURL, wasmURL, workerURL })
            this.ffmpeg = ff
            onLog?.('> Núcleo FFmpeg.wasm multi-hilo listo (máxima velocidad en tu CPU).')
            return ff
          } catch (err) {
            lastError = err
            onLog?.(`! Multi-hilo no disponible en ${baseUrl}, probando respaldo...`)
          }
        }
      }

      for (const baseUrl of SINGLE_THREAD_SOURCES) {
        try {
          const label = baseUrl.startsWith('http')
            ? baseUrl.includes('jsdelivr')
              ? 'jsDelivr'
              : 'unpkg'
            : 'local'
          onLog?.(`> Inicializando núcleo FFmpeg.wasm (${label})...`)
          const coreURL = await toBlobURL(`${baseUrl}/ffmpeg-core.js`, 'text/javascript')
          const wasmURL = await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, 'application/wasm')
          await ff.load({ coreURL, wasmURL })
          this.ffmpeg = ff
          onLog?.('> Núcleo FFmpeg.wasm listo (100% local en tu navegador).')
          return ff
        } catch (err) {
          lastError = err
          onLog?.(`! Falló mirror ${baseUrl}, intentando respaldo...`)
        }
      }

      this.loadPromise = null
      throw new Error(`No se pudo cargar FFmpeg.wasm: ${String(lastError)}`)
    })()

    return this.loadPromise
  }

  async encodeSticker(
    media: MediaInfo,
    settings: StickerSettings,
    callbacks: EngineCallbacks
  ): Promise<EncodeResult> {
    const ff = await this.ensureLoaded(callbacks.onLog)
    const ext = media.name.split('.').pop()?.toLowerCase() || (media.isGif ? 'gif' : 'mp4')
    const inputName = `input.${ext}`
    const outputName = 'sticker.webp'

    const effectiveDuration = computeEffectiveDuration(settings.trimStart, settings.trimEnd, settings.speed)

    let currentPass = 1
    let totalPlannedPasses = 1

    const logListener = ({ message }: { message: string }) => {
      const t = parseFfmpegTime(message)
      if (t !== null && effectiveDuration > 0) {
        const passRatio = Math.min(1, t / effectiveDuration)
        const overall = (currentPass - 1 + passRatio) / totalPlannedPasses
        callbacks.onProgress(
          Math.min(0.98, overall),
          `[Pasada ${currentPass}/${totalPlannedPasses}] Codificando WebP... ${Math.round(passRatio * 100)}%`
        )
      }
      if (message.includes('frame=') || message.includes('Output #0') || message.includes('Error')) {
        callbacks.onLog(message)
      }
    }

    ff.on('log', logListener)

    try {
      callbacks.onProgress(0.03, 'Cargando archivo en memoria WASM...')
      await ff.writeFile(inputName, await fetchFile(media.file))

      const steps = settings.autoCompressWhatsApp
        ? planAutoCompressSteps(settings.fps, settings.quality)
        : [{ fps: settings.fps, quality: settings.quality, compressionLevel: settings.compressionLevel }]

      totalPlannedPasses = steps.length
      const passLogs: EncodePassLog[] = []
      let bestBytes: Uint8Array | null = null
      let bestStep = steps[0]

      for (let i = 0; i < steps.length; i++) {
        currentPass = i + 1
        const step = steps[i]
        callbacks.onLog(
          `> Pasada ${currentPass}: fps=${step.fps}, q=${step.quality}, comp=${step.compressionLevel}`
        )
        callbacks.onProgress(
          (i / steps.length) * 0.92 + 0.05,
          `Forjando sticker [Pasada ${currentPass}: ${step.fps}fps · q${step.quality}]...`
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
          throw new Error(`FFmpeg terminó con código ${exitCode}.`)
        }

        const data = (await ff.readFile(outputName)) as Uint8Array
        const sizeKB = (data.byteLength / 1024).toFixed(1)
        passLogs.push({
          pass: currentPass,
          fps: step.fps,
          quality: step.quality,
          sizeBytes: data.byteLength,
        })
        callbacks.onLog(`  ↳ Resultado: ${sizeKB} KB`)

        bestBytes = data
        bestStep = step

        if (!settings.autoCompressWhatsApp || data.byteLength <= settings.maxBytes) {
          break
        }
      }

      if (!bestBytes) {
        throw new Error('No se generó ningún archivo WebP.')
      }

      const copy = new Uint8Array(bestBytes.byteLength)
      copy.set(bestBytes)
      const blob = new Blob([copy.buffer], { type: 'image/webp' })
      const url = URL.createObjectURL(blob)

      callbacks.onProgress(1, 'Sticker forjado.')

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
