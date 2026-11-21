/**
 * 100% Client-Side AI Background Removal Engine:
 * - 'mediapipe': Google MediaPipe Selfie Segmenter (float16, ~244 KB, WebGL2 GPU, ~15-30ms/frame on any PC)
 * - 'rmbg': BRIA RMBG-1.4 via @huggingface/transformers (WebGPU fp32, high precision for objects/anime)
 */

export type BgRemoveModelId = 'mediapipe' | 'rmbg'

interface LoadedMediaPipe {
  kind: 'mediapipe'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  segmenter: any
}

interface LoadedRmbg {
  kind: 'rmbg'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RawImage: any
}

export type LoadedBgModel = LoadedMediaPipe | LoadedRmbg

let cachedModel: LoadedBgModel | null = null

async function hasWebGpu(): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any
    if (!nav?.gpu) return false
    const adapter = await nav.gpu.requestAdapter()
    return Boolean(adapter)
  } catch {
    return false
  }
}

export async function ensureBgRemoverLoaded(
  modelId: BgRemoveModelId,
  onLog?: (msg: string) => void,
  onDownloadProgress?: (ratio: number, text: string) => void
): Promise<LoadedBgModel> {
  if (cachedModel && cachedModel.kind === modelId) {
    return cachedModel
  }

  if (modelId === 'mediapipe') {
    onLog?.('> Loading MediaPipe GPU Segmenter (244 KB, WebGL2 GPU)...')
    onDownloadProgress?.(0.08, 'Loading MediaPipe GPU model (244 KB)...')

    const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
    )

    const segmenter = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })

    onLog?.('> ✓ MediaPipe GPU Segmenter ready (ultra-fast).')
    cachedModel = { kind: 'mediapipe', segmenter }
    return cachedModel
  }

  // High-precision RMBG-1.4 on WebGPU (using fp32/fp16 — NOT q8, which forces slow CPU fallback)
  const repo = 'briaai/RMBG-1.4'
  onLog?.(`> Loading ${repo} (WebGPU)...`)

  const { AutoModel, AutoProcessor, RawImage, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false

  const useWebGpu = await hasWebGpu()
  const device = useWebGpu ? 'webgpu' : 'wasm'
  onLog?.(`> AI Runtime: ${useWebGpu ? 'WebGPU (GPU accelerated)' : 'WASM (CPU fallback)'}`)

  const progressCb = (info: { status?: string; progress?: number; file?: string }) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.max(0, Math.min(100, Math.round(info.progress)))
      onDownloadProgress?.(
        0.04 + (pct / 100) * 0.2,
        `Downloading AI model (${info.file || repo}): ${pct}%`
      )
    }
  }

  const processor = await AutoProcessor.from_pretrained(repo, {
    progress_callback: progressCb,
  })

  const model = await AutoModel.from_pretrained(repo, {
    device,
    progress_callback: progressCb,
  })

  onLog?.(`> ✓ ${repo} ready (cached locally in browser).`)
  cachedModel = { kind: 'rmbg', model, processor, RawImage }
  return cachedModel
}

/**
 * Removes the background from a rendered 512x512 frame canvas in-place.
 * Preserves existing transparent borders by multiplying alpha channels.
 */
export async function applyAiBgRemovalToCanvas(
  canvas: HTMLCanvasElement,
  loaded: LoadedBgModel
): Promise<void> {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rgba = imgData.data
  const pixelCount = canvas.width * canvas.height

  if (loaded.kind === 'mediapipe') {
    const result = loaded.segmenter.segment(canvas)
    const confMask = result?.confidenceMasks?.[0]
    if (!confMask) return
    const floats = confMask.getAsFloat32Array() as Float32Array
    const len = Math.min(pixelCount, floats.length)
    for (let i = 0; i < len; i++) {
      // Smooth threshold around 0.5 for crisp sticker edges
      const c = floats[i]
      const maskAlpha = c <= 0.25 ? 0 : c >= 0.75 ? 255 : Math.round(((c - 0.25) / 0.5) * 255)
      rgba[i * 4 + 3] = Math.round((rgba[i * 4 + 3] * maskAlpha) / 255)
    }
    confMask.close?.()
    result.close?.()
    ctx.putImageData(imgData, 0, 0)
    return
  }

  const { model, processor, RawImage } = loaded
  const rawImg = RawImage.fromCanvas(canvas)
  const { pixel_values } = await processor(rawImg)
  const { output } = await model({ input: pixel_values })

  const maskTensor = output[0].mul(255).to('uint8')
  const maskImg = await RawImage.fromTensor(maskTensor).resize(canvas.width, canvas.height)
  const maskData = maskImg.data as Uint8Array
  const stride = Math.max(1, Math.floor(maskData.length / pixelCount))

  for (let i = 0; i < pixelCount; i++) {
    const maskAlpha = maskData[i * stride]
    rgba[i * 4 + 3] = Math.round((rgba[i * 4 + 3] * maskAlpha) / 255)
  }

  ctx.putImageData(imgData, 0, 0)
}
