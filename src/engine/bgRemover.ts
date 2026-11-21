/**
 * 100% Client-Side AI Background Removal Engine powered by @huggingface/transformers (WebGPU / WASM).
 * - 'modnet': Xenova/modnet (~25 MB, Apache-2.0, 512x512 native, fast on WebGPU)
 * - 'rmbg': briaai/RMBG-1.4 (~44 MB, general purpose: anime, objects, people, pets; forced to 512x512 for 4x speed)
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
  onLog?.(`> Loading AI background removal model (${repo})...`)

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

  // Cap processor input size to <=512x512 so 4K/1024px never wastes GPU/CPU time
  if (processor?.feature_extractor?.size) {
    processor.feature_extractor.size = { width: 512, height: 512 }
  }

  // Use fp32 on WebGPU (avoid q8 which forces slow CPU fallback on many WebGPU drivers)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model: any
  try {
    model = await AutoModel.from_pretrained(repo, {
      device,
      progress_callback: progressCb,
    })
  } catch {
    onLog?.('> WebGPU init failed, falling back to WASM...')
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
 * Finds the tight non-transparent bounding box inside a 512x512 canvas
 * so AI inference only runs on the actual cropped/scaled media region.
 */
function findOpaqueBounds(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    const rowOff = y * width * 4
    for (let x = 0; x < width; x++) {
      if (rgba[rowOff + x * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * Removes the background from a rendered 512x512 frame canvas in-place.
 * Extracts only the non-transparent media region, normalizes float logits properly,
 * and composites the resulting alpha matte back onto the 512x512 canvas.
 */
export async function applyAiBgRemovalToCanvas(
  canvas: HTMLCanvasElement,
  loaded: LoadedBgModel
): Promise<void> {
  const ctx = canvas.getContext('2d')!
  const fullData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const bounds = findOpaqueBounds(fullData.data, canvas.width, canvas.height)
  if (!bounds) return

  // Extract tight sub-canvas of only the cropped/visible media region
  const subCanvas = document.createElement('canvas')
  subCanvas.width = bounds.w
  subCanvas.height = bounds.h
  const sctx = subCanvas.getContext('2d')!
  sctx.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h)

  const { model, processor, RawImage } = loaded
  const rawImg = RawImage.fromCanvas(subCanvas)
  const { pixel_values } = await processor(rawImg)
  const { output } = await model({ input: pixel_values })

  // output[0] has shape [1, H, W] or [H, W] with raw float values/logits
  const outTensor = output[0]
  const dims = outTensor.dims as number[]
  const outH = dims[dims.length - 2]
  const outW = dims[dims.length - 1]
  const rawFloats = outTensor.data as Float32Array

  // Min-max normalize float logits to [0, 255] uint8 alpha matte
  let minVal = Infinity
  let maxVal = -Infinity
  const totalOut = outW * outH
  for (let i = 0; i < totalOut; i++) {
    const v = rawFloats[i]
    if (v < minVal) minVal = v
    if (v > maxVal) maxVal = v
  }
  const range = maxVal - minVal || 1
  const normBytes = new Uint8ClampedArray(totalOut)
  for (let i = 0; i < totalOut; i++) {
    const norm = (rawFloats[i] - minVal) / range
    // Gentle S-curve contrast around 0.45 for cleaner sticker edges
    const clean = norm <= 0.15 ? 0 : norm >= 0.85 ? 255 : Math.round(((norm - 0.15) / 0.7) * 255)
    normBytes[i] = clean
  }

  // Resize normalized mask to the subCanvas dimensions
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = outW
  maskCanvas.height = outH
  const mctx = maskCanvas.getContext('2d')!
  const maskImgData = mctx.createImageData(outW, outH)
  for (let i = 0; i < totalOut; i++) {
    const a = normBytes[i]
    maskImgData.data[i * 4] = a
    maskImgData.data[i * 4 + 1] = a
    maskImgData.data[i * 4 + 2] = a
    maskImgData.data[i * 4 + 3] = 255
  }
  mctx.putImageData(maskImgData, 0, 0)

  const resizedMaskCanvas = document.createElement('canvas')
  resizedMaskCanvas.width = bounds.w
  resizedMaskCanvas.height = bounds.h
  const rmctx = resizedMaskCanvas.getContext('2d')!
  rmctx.imageSmoothingEnabled = true
  rmctx.imageSmoothingQuality = 'high'
  rmctx.drawImage(maskCanvas, 0, 0, bounds.w, bounds.h)

  const resizedMaskData = rmctx.getImageData(0, 0, bounds.w, bounds.h).data
  const rgba = fullData.data

  for (let y = 0; y < bounds.h; y++) {
    for (let x = 0; x < bounds.w; x++) {
      const fullIdx = ((bounds.y + y) * canvas.width + (bounds.x + x)) * 4 + 3
      const maskAlpha = resizedMaskData[(y * bounds.w + x) * 4]
      rgba[fullIdx] = Math.round((rgba[fullIdx] * maskAlpha) / 255)
    }
  }

  ctx.putImageData(fullData, 0, 0)
}
