/**
 * 100% Client-Side AI Background Removal Engine powered by @huggingface/transformers (ONNX + WebGPU/WASM).
 * Dynamically imported so initial page load stays 0 KB until the user enables "Remove Background".
 */

export type BgRemoveModelId = 'modnet' | 'rmbg'

const MODEL_REPOS: Record<BgRemoveModelId, string> = {
  modnet: 'Xenova/modnet',
  rmbg: 'briaai/RMBG-1.4',
}

interface LoadedBgModel {
  modelId: BgRemoveModelId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  RawImage: any
}

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
  if (cachedModel && cachedModel.modelId === modelId) {
    return cachedModel
  }

  const repo = MODEL_REPOS[modelId]
  onLog?.(`> Loading local AI background removal model (${repo})...`)

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

  // Try WebGPU first, fall back to WASM if WebGPU fails on this GPU/driver
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model: any
  try {
    model = await AutoModel.from_pretrained(repo, {
      device,
      dtype: 'q8',
      progress_callback: progressCb,
    })
  } catch {
    onLog?.('> Quantized WebGPU init failed, falling back to default WASM...')
    model = await AutoModel.from_pretrained(repo, {
      device: 'wasm',
      progress_callback: progressCb,
    })
  }

  onLog?.(`> ✓ AI model ${repo} ready (cached locally in browser).`)
  cachedModel = { modelId, model, processor, RawImage }
  return cachedModel
}

/**
 * Removes the background from a rendered 512x512 frame canvas in-place using the loaded ONNX model.
 * Preserves existing transparent borders by multiplying alpha channels.
 */
export async function applyAiBgRemovalToCanvas(
  canvas: HTMLCanvasElement,
  loaded: LoadedBgModel
): Promise<void> {
  const { model, processor, RawImage } = loaded
  const rawImg = RawImage.fromCanvas(canvas)
  const { pixel_values } = await processor(rawImg)
  const { output } = await model({ input: pixel_values })

  // Extract single-channel alpha matte tensor and resize to canvas dimensions
  const maskTensor = output[0].mul(255).to('uint8')
  const maskImg = await RawImage.fromTensor(maskTensor).resize(canvas.width, canvas.height)
  const maskData = maskImg.data as Uint8Array

  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const rgba = imgData.data
  const pixelCount = canvas.width * canvas.height
  const stride = Math.max(1, Math.floor(maskData.length / pixelCount))

  for (let i = 0; i < pixelCount; i++) {
    const maskAlpha = maskData[i * stride]
    const existingAlpha = rgba[i * 4 + 3]
    // Multiply existing alpha with predicted mask alpha so outer transparent canvas padding stays clean
    rgba[i * 4 + 3] = Math.round((existingAlpha * maskAlpha) / 255)
  }

  ctx.putImageData(imgData, 0, 0)
}
