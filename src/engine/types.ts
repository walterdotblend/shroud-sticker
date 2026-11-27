export type FitMode = 'contain-transparent' | 'contain-dark' | 'cover' | 'stretch'

export type CropAspect = '1:1' | 'free' | '16:9' | '4:3' | '9:16'

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export type CanvasBgMode = 'transparent' | 'obsidian'

export interface AudioTrackInfo {
  name: string
  duration: number
  peaks: number[]
  isFromVideo: boolean
  objectUrl: string
  file: File
}

export interface StickerSettings {
  trimStart: number
  trimEnd: number
  speed: number
  reverse: boolean
  crop: CropRect | null
  fitMode: FitMode
  canvasBg: CanvasBgMode
  canvasScale: number
  canvasX: number
  canvasY: number
  rotationDeg: number
  flipH: boolean
  targetSize: number
  fps: number
  quality: number
  cursedLevel: number
  removeBg: boolean
  bgModel: 'modnet' | 'rmbg'
  compressionLevel: number
  autoCompressWhatsApp: boolean
  maxBytes: number
  audioEnabled: boolean
  audioVolume: number
  audioStart: number
  audioEnd: number
  loopVideoToAudio: boolean
}

export interface MediaInfo {
  name: string
  width: number
  height: number
  duration: number
  sourceFps: number
  sizeBytes: number
  isGif: boolean
  objectUrl: string
  file: File
}

export interface EncodePassLog {
  pass: number
  fps: number
  quality: number
  sizeBytes: number
}

export interface EncodeResult {
  blob: Blob
  url: string
  sizeBytes: number
  width: number
  height: number
  durationSec: number
  passes: EncodePassLog[]
  fpsUsed: number
  qualityUsed: number
  whatsappValid: boolean
  oggBlob?: Blob
  oggSizeBytes?: number
  audioDurationSec?: number
}

export const WHATSAPP_MAX_BYTES = 500 * 1024 // 500 KB hard limit
export const WHATSAPP_SAFE_TARGET_BYTES = 485 * 1024 // 485 KB safe target preserving smooth FPS under 500 KB
export const WHATSAPP_MAX_DURATION_SEC = 10
export const WHATSAPP_STICKER_SIZE = 512
