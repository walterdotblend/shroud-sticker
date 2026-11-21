export type LangCode = 'en' | 'es' | 'pt' | 'fr' | 'de' | 'ja' | 'ru'

export const SUPPORTED_LANGS: { code: LangCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ru', label: 'Русский' },
]

export interface Translations {
  appTitle: string
  localBadge: string
  specBadge: string
  step1Title: string
  step2Title: string
  step3Title: string
  step1Heading: string
  step1Sub: string
  dropMain: string
  dropLoaded: string
  dropSub: string
  urlPlaceholder: string
  urlButton: string
  urlLoading: string
  urlHint: string
  continueToEdit: string
  backToSource: string
  continueToForge: string
  backToEdit: string
  viewerTitle: string
  tabOriginal: string
  tabSticker: string
  emptyTitle: string
  emptySub: string
  play: string
  pause: string
  resetCrop: string
  trimSpeedTitle: string
  finalDuration: string
  max10s: string
  start: string
  end: string
  speed: string
  reverse: string
  cropResizeTitle: string
  noCrop: string
  cropHint: string
  aspectFree: string
  fitLabel: string
  fitContainTrans: string
  fitContainTransHint: string
  fitCover: string
  fitCoverHint: string
  fitContainDark: string
  fitContainDarkHint: string
  fitStretch: string
  fitStretchHint: string
  compressTitle: string
  autoCompress: string
  fpsLabel: string
  qualityLabel: string
  forgeButton: string
  forgingButton: string
  downloadButton: string
  whatsappOk: string
  whatsappTooBig: string
  readyStatus: string
  forgedStatus: string
  errInvalidUrl: string
  errCorsBlocked: string
  errHtmlNoMedia: string
  errEmptyFile: string
  canvasTransformTitle: string
  scaleLabel: string
  rotateLabel: string
  canvasBgLabel: string
  bgTransparent: string
  bgObsidian: string
  maxLimitHint: string
  importTitle: string
  importAndroid: string
  importIos: string
  importDesktop: string
  cursedLabel: string
  dynamicBudgetHint: string
  downloadWebpPc: string
  downloadWastickersMobile: string
  qrTitle: string
  qrLocalNote: string
  pcLimitationNote: string
  p2pReceivingTitle: string
  p2pShareStickerMaker: string
  p2pDownloadWastickers: string
  removeBgLabel: string
  removeBgModelFast: string
  removeBgModelHigh: string
}

const en: Translations = {
  appTitle: 'SHROUD // STICKER FORGE',
  localBadge: '100% LOCAL · WASM',
  specBadge: 'WHATSAPP: 512×512 · ≤500 KB · ≤10s · WEBP',
  step1Title: '01 · SOURCE',
  step2Title: '02 · EDIT',
  step3Title: '03 · FORGE',
  step1Heading: 'SUMMON MEDIA (GIF / VIDEO / URL)',
  step1Sub: 'Drop a local file or paste a direct link / Giphy / Tenor / Imgur / video page URL.',
  dropMain: 'Drop a GIF or short video here (or click to browse)',
  dropLoaded: 'Loaded:',
  dropSub: '100% client-side in your browser · GIF, MP4, WebM, MOV, WebP',
  urlPlaceholder: 'https://... GIF, MP4, Giphy, Tenor, Imgur, or video URL',
  urlButton: 'Fetch',
  urlLoading: 'Fetching...',
  urlHint: 'Supports direct media, Giphy/Tenor/Imgur pages, HTML meta extraction & CORS fallback.',
  continueToEdit: 'Continue to Edit →',
  backToSource: '← Change Source',
  continueToForge: 'Next: Compress & Forge →',
  backToEdit: '← Back to Edit',
  viewerTitle: 'VIEWPORT // CROP & PREVIEW',
  tabOriginal: 'Original',
  tabSticker: 'Sticker (.webp)',
  emptyTitle: 'No media summoned yet',
  emptySub: 'Upload a GIF/video or fetch a URL in Step 01 to begin.',
  play: 'Play',
  pause: 'Pause',
  resetCrop: 'Reset Crop',
  trimSpeedTitle: 'TRIM & SPEED',
  finalDuration: 'Final:',
  max10s: '(Max 10s WhatsApp)',
  start: 'Start:',
  end: 'End:',
  speed: 'Speed:',
  reverse: 'Reverse',
  cropResizeTitle: 'CROP & RESIZE (512×512)',
  noCrop: 'Clear Crop',
  cropHint: 'Crop aspect (drag box on preview):',
  aspectFree: 'Free',
  fitLabel: '512×512 Fit Mode:',
  fitContainTrans: 'Contain (Transparent)',
  fitContainTransHint: 'Preserves aspect with alpha padding',
  fitCover: 'Cover (Fill 512×512)',
  fitCoverHint: 'Crops edges to fill square',
  fitContainDark: 'Contain (Obsidian Pad)',
  fitContainDarkHint: 'Pads with #080709 dark background',
  fitStretch: 'Stretch',
  fitStretchHint: 'Stretches to exact 512×512',
  compressTitle: 'WHATSAPP AUTO-COMPRESSION',
  autoCompress: 'Auto ≤ 500 KB',
  fpsLabel: 'FPS:',
  qualityLabel: 'Initial Quality:',
  forgeButton: 'Forge Sticker (.webp)',
  forgingButton: 'Forging...',
  downloadButton: 'Download .webp',
  whatsappOk: '· WHATSAPP OK ✓',
  whatsappTooBig: '· EXCEEDS LIMIT',
  readyStatus: 'Ready to forge.',
  forgedStatus: 'Sticker forged.',
  errInvalidUrl: 'Enter a valid URL starting with http:// or https://',
  errCorsBlocked: 'Remote server blocked browser access (CORS). Download the file locally and drop it here.',
  errHtmlNoMedia: 'Could not find a playable video/GIF inside that webpage. Try pasting the direct .mp4/.gif link.',
  errEmptyFile: 'Downloaded file is empty.',
  canvasTransformTitle: '512×512 CANVAS & TRANSPARENCY',
  scaleLabel: 'Scale',
  rotateLabel: 'Rotation',
  canvasBgLabel: 'Sticker Background:',
  bgTransparent: 'Transparent (Alpha)',
  bgObsidian: 'Obsidian (#080709)',
  maxLimitHint: 'WhatsApp hard limits enforced: 512×512 px · ≤ 500 KB · ≤ 10s.',
  importTitle: 'HOW TO IMPORT INTO WHATSAPP',
  importAndroid: '1. Tap .wastickers or .webp (or scan the QR code with your phone to receive it directly on your mobile).',
  importIos: '2. Open the downloaded file on your phone with "Sticker Maker" (Android / iPhone) and tap "Add to WhatsApp".',
  importDesktop: '3. Done! Your animated sticker will appear on your phone and automatically sync to WhatsApp Web & Windows PC.',
  cursedLabel: 'Cursed / Ugly',
  dynamicBudgetHint: 'Max FPS capped to source; lower FPS to unlock higher quality.',
  downloadWebpPc: '.webp',
  downloadWastickersMobile: '.wastickers',
  qrTitle: 'SCAN WITH YOUR PHONE TO IMPORT',
  qrLocalNote: 'Keep this tab open and scan with your phone camera to receive the sticker directly on your phone (100% local).',
  pcLimitationNote: '',
  p2pReceivingTitle: 'RECEIVING STICKER FROM YOUR PC',
  p2pShareStickerMaker: 'Open in Sticker Maker (.wastickers)',
  p2pDownloadWastickers: 'Download .wastickers',
  removeBgLabel: 'Remove Background (100% Local AI)',
  removeBgModelFast: 'MODNet · Fast (~25 MB, Apache-2.0)',
  removeBgModelHigh: 'RMBG-1.4 · High Precision (~44 MB)',
}

const es: Translations = {
  appTitle: 'SHROUD // FORJA DE STICKERS',
  localBadge: '100% LOCAL · WASM',
  specBadge: 'WHATSAPP: 512×512 · ≤500 KB · ≤10s · WEBP',
  step1Title: '01 · FUENTE',
  step2Title: '02 · EDITAR',
  step3Title: '03 · FORJAR',
  step1Heading: 'INVOCAR MEDIO (GIF / VIDEO / URL)',
  step1Sub: 'Arrastra un archivo local o pega un enlace directo / Giphy / Tenor / Imgur / página de video.',
  dropMain: 'Arrastra un GIF o video corto aquí (o haz clic)',
  dropLoaded: 'Cargado:',
  dropSub: 'Procesamiento 100% local en tu PC · GIF, MP4, WebM, MOV, WebP',
  urlPlaceholder: 'https://... enlace de GIF, MP4, Giphy, Tenor, Imgur o video',
  urlButton: 'Descargar',
  urlLoading: 'Bajando...',
  urlHint: 'Soporta enlaces directos, páginas Giphy/Tenor/Imgur, extracción HTML y respaldo CORS.',
  continueToEdit: 'Continuar a Editar →',
  backToSource: '← Cambiar Fuente',
  continueToForge: 'Siguiente: Comprimir y Forjar →',
  backToEdit: '← Volver a Editar',
  viewerTitle: 'VISOR // RECORTE & PREVIEW',
  tabOriginal: 'Original',
  tabSticker: 'Sticker (.webp)',
  emptyTitle: 'Ningún medio invocado',
  emptySub: 'Sube un GIF/video o pega una URL en el Paso 01 para comenzar.',
  play: 'Play',
  pause: 'Pausa',
  resetCrop: 'Reset Crop',
  trimSpeedTitle: 'DURACIÓN & VELOCIDAD',
  finalDuration: 'Final:',
  max10s: '(Máx 10s WhatsApp)',
  start: 'Inicio:',
  end: 'Fin:',
  speed: 'Velocidad:',
  reverse: 'Reversa',
  cropResizeTitle: 'RECORTAR & REDIMENSIONAR (512×512)',
  noCrop: 'Sin recorte',
  cropHint: 'Proporción de recorte (arrastra el cuadro en el visor):',
  aspectFree: 'Libre',
  fitLabel: 'Ajuste a 512×512:',
  fitContainTrans: 'Contain (Transparente)',
  fitContainTransHint: 'Mantiene proporción con fondo alpha',
  fitCover: 'Cover (Llenar 512×512)',
  fitCoverHint: 'Recorta bordes para llenar el cuadro',
  fitContainDark: 'Contain (Fondo Oscuro)',
  fitContainDarkHint: 'Bordes color obsidiana #080709',
  fitStretch: 'Estirar (Stretch)',
  fitStretchHint: 'Ajusta exacto a 512×512',
  compressTitle: 'COMPRESIÓN AUTOMÁTICA WHATSAPP',
  autoCompress: 'Auto ≤ 500 KB',
  fpsLabel: 'FPS:',
  qualityLabel: 'Calidad inicial:',
  forgeButton: 'Forjar Sticker (.webp)',
  forgingButton: 'Forjando...',
  downloadButton: 'Descargar .webp',
  whatsappOk: '· WHATSAPP OK ✓',
  whatsappTooBig: '· EXCEDE LÍMITE',
  readyStatus: 'Listo para forjar.',
  forgedStatus: 'Sticker forjado.',
  errInvalidUrl: 'Ingresa una URL válida que empiece con http:// o https://',
  errCorsBlocked: 'El servidor remoto bloqueó la descarga por CORS. Descarga el archivo en tu PC y arrástralo aquí.',
  errHtmlNoMedia: 'No se encontró un video/GIF extraíble en esa página. Prueba con el enlace directo .mp4 o .gif.',
  errEmptyFile: 'El archivo descargado está vacío.',
  canvasTransformTitle: 'CANVAS 512×512 & TRANSPARENCIA',
  scaleLabel: 'Escala',
  rotateLabel: 'Rotación',
  canvasBgLabel: 'Fondo del Sticker:',
  bgTransparent: 'Transparente (Alpha)',
  bgObsidian: 'Obsidiana (#080709)',
  maxLimitHint: 'Límite estricto de WhatsApp: 512×512 px · ≤ 500 KB · ≤ 10s.',
  importTitle: 'CÓMO IMPORTARLO A WHATSAPP',
  importAndroid: '1. Descarga .wastickers o .webp (o escanea el código QR con tu celular para pasarlo directo a tu teléfono).',
  importIos: '2. Ábrelo en tu celular con la app "Sticker Maker" (Android / iPhone) y toca "Añadir a WhatsApp".',
  importDesktop: '3. ¡Listo! El sticker animado aparecerá en tu celular y se sincronizará automáticamente con tu WhatsApp Web y PC.',
  cursedLabel: 'Cursed / Feo',
  dynamicBudgetHint: 'FPS máx según origen; baja los FPS para desbloquear mayor calidad.',
  downloadWebpPc: '.webp',
  downloadWastickersMobile: '.wastickers',
  qrTitle: 'ESCANEA CON TU CELULAR PARA IMPORTAR',
  qrLocalNote: 'Mantén esta pestaña abierta y escanea el QR con la cámara de tu celular para recibir el sticker directo en tu teléfono (100% local).',
  pcLimitationNote: '',
  p2pReceivingTitle: 'RECIBIENDO STICKER DESDE TU PC',
  p2pShareStickerMaker: 'Abrir en Sticker Maker (.wastickers)',
  p2pDownloadWastickers: 'Descargar .wastickers',
  removeBgLabel: 'Quitar Fondo (IA 100% Local)',
  removeBgModelFast: 'MODNet · Rápido (~25 MB, Apache-2.0)',
  removeBgModelHigh: 'RMBG-1.4 · Alta Precisión (~44 MB)',
}

const pt: Translations = {
  ...en,
  appTitle: 'SHROUD // FORJA DE FIGURINHAS',
  step1Title: '01 · FONTE',
  step2Title: '02 · EDITAR',
  step3Title: '03 · FORJAR',
  step1Heading: 'CARREGAR MÍDIA (GIF / VÍDEO / URL)',
  step1Sub: 'Solte um arquivo local ou cole um link direto / Giphy / Tenor / Imgur.',
  dropMain: 'Arraste um GIF ou vídeo curto aqui (ou clique)',
  dropLoaded: 'Carregado:',
  urlButton: 'Baixar',
  urlLoading: 'Baixando...',
  continueToEdit: 'Continuar para Editar →',
  backToSource: '← Trocar Fonte',
  continueToForge: 'Próximo: Comprimir e Forjar →',
  backToEdit: '← Voltar para Editar',
  trimSpeedTitle: 'DURAÇÃO & VELOCIDADE',
  speed: 'Velocidade:',
  reverse: 'Reverso',
  cropResizeTitle: 'CORTAR & REDIMENSIONAR (512×512)',
  aspectFree: 'Livre',
  compressTitle: 'COMPRESSÃO AUTOMÁTICA WHATSAPP',
  forgeButton: 'Forjar Figurinha (.webp)',
  forgingButton: 'Forjando...',
  downloadButton: 'Baixar .webp',
  readyStatus: 'Pronto para forjar.',
  canvasTransformTitle: 'CANVAS 512×512 & TRANSPARÊNCIA',
  scaleLabel: 'Escala',
  rotateLabel: 'Rotação',
  canvasBgLabel: 'Fundo:',
  bgTransparent: 'Transparente (Alpha)',
  bgObsidian: 'Obsidiana (#080709)',
  importTitle: 'COMO IMPORTAR NO WHATSAPP',
  importAndroid: 'Android: Abra com "Sticker Maker" ou "Personal Stickers for WhatsApp".',
}

const fr: Translations = {
  ...en,
  step1Title: '01 · SOURCE',
  step2Title: '02 · ÉDITER',
  step3Title: '03 · FORGER',
  dropMain: 'Déposez un GIF ou une courte vidéo ici (ou cliquez)',
  urlButton: 'Télécharger',
  urlLoading: 'Chargement...',
  continueToEdit: 'Continuer vers Édition →',
  backToSource: '← Changer de source',
  continueToForge: 'Suivant : Compresser →',
  backToEdit: '← Retour à l’édition',
  trimSpeedTitle: 'DURÉE & VITESSE',
  speed: 'Vitesse :',
  reverse: 'Inverser',
  cropResizeTitle: 'ROGNAGE & TAILLE (512×512)',
  aspectFree: 'Libre',
  compressTitle: 'COMPRESSION AUTO WHATSAPP',
  forgeButton: 'Forger le Sticker (.webp)',
  forgingButton: 'Forge en cours...',
  downloadButton: 'Télécharger .webp',
}

const de: Translations = {
  ...en,
  step1Title: '01 · QUELLE',
  step2Title: '02 · BEARBEITEN',
  step3Title: '03 · SCHMIEDEN',
  dropMain: 'GIF oder kurzes Video hier ablegen (oder klicken)',
  urlButton: 'Laden',
  urlLoading: 'Lädt...',
  continueToEdit: 'Weiter zum Bearbeiten →',
  backToSource: '← Quelle ändern',
  continueToForge: 'Weiter: Komprimieren →',
  backToEdit: '← Zurück',
  trimSpeedTitle: 'DAUER & TEMPO',
  speed: 'Tempo:',
  reverse: 'Rückwärts',
  cropResizeTitle: 'ZUSCHNITT & GRÖSSE (512×512)',
  aspectFree: 'Frei',
  compressTitle: 'WHATSAPP AUTO-KOMPRESSION',
  forgeButton: 'Sticker erstellen (.webp)',
  forgingButton: 'Erstelle...',
  downloadButton: '.webp herunterladen',
}

const ja: Translations = {
  ...en,
  step1Title: '01 · ソース',
  step2Title: '02 · 編集',
  step3Title: '03 · 生成',
  dropMain: 'GIFまたは短い動画をここにドロップ（またはクリック）',
  urlButton: '取得',
  urlLoading: '取得中...',
  continueToEdit: '編集へ進む →',
  backToSource: '← ソースを変更',
  continueToForge: '次へ：圧縮と生成 →',
  backToEdit: '← 編集に戻る',
  trimSpeedTitle: '長さ・再生速度',
  speed: '速度:',
  reverse: '逆再生',
  cropResizeTitle: '切り抜き・リサイズ (512×512)',
  aspectFree: '自由',
  compressTitle: 'WHATSAPP 自動圧縮',
  forgeButton: 'スタンプを生成 (.webp)',
  forgingButton: '生成中...',
  downloadButton: '.webp を保存',
}

const ru: Translations = {
  ...en,
  step1Title: '01 · ИСТОЧНИК',
  step2Title: '02 · ПРАВКА',
  step3Title: '03 · СОЗДАТЬ',
  dropMain: 'Перетащите GIF или короткое видео сюда (или нажмите)',
  urlButton: 'Скачать',
  urlLoading: 'Загрузка...',
  continueToEdit: 'Перейти к правке →',
  backToSource: '← Сменить источник',
  continueToForge: 'Далее: Сжатие и экспорт →',
  backToEdit: '← Назад к правке',
  trimSpeedTitle: 'ОБРЕЗКА И СКОРОСТЬ',
  speed: 'Скорость:',
  reverse: 'Реверс',
  cropResizeTitle: 'КАДРИРОВАНИЕ И РАЗМЕР (512×512)',
  aspectFree: 'Свободно',
  compressTitle: 'АВТОСЖАТИЕ WHATSAPP',
  forgeButton: 'Создать стикер (.webp)',
  forgingButton: 'Создание...',
  downloadButton: 'Скачать .webp',
}

const DICTIONARIES: Record<LangCode, Translations> = { en, es, pt, fr, de, ja, ru }

export function detectInitialLang(): LangCode {
  try {
    const saved = localStorage.getItem('shroud_lang') as LangCode | null
    if (saved && saved in DICTIONARIES) return saved
  } catch {
    // ignore
  }

  const candidates = typeof navigator !== 'undefined'
    ? [...(navigator.languages || []), navigator.language].filter(Boolean)
    : []

  for (const raw of candidates) {
    const base = raw.toLowerCase().split('-')[0] as LangCode
    if (base in DICTIONARIES) return base
  }

  return 'en'
}

export function getTranslations(lang: LangCode): Translations {
  return DICTIONARIES[lang] ?? DICTIONARIES.en
}
