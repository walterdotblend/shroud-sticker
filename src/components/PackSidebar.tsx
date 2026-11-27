import { useRef, useState } from 'react'
import { Download, Package, Smartphone, Trash2, Upload, X } from 'lucide-react'
import type { PackStickerItem } from '../engine/wastickers'
import type { Translations } from '../i18n/translations'

interface PackSidebarProps {
  t: Translations
  packName: string
  items: PackStickerItem[]
  packError: string | null
  onPackNameChange: (name: string) => void
  onDropWebpFiles: (files: FileList | File[]) => void
  onRenameItem: (id: string, nextName: string) => void
  onRemoveItem: (id: string) => void
  onClearPack: () => void
  onDownloadPack: () => void
}

export function PackSidebar({
  t,
  packName,
  items,
  packError,
  onPackNameChange,
  onDropWebpFiles,
  onRenameItem,
  onRemoveItem,
  onClearPack,
  onDownloadPack,
}: PackSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files?.length) {
      onDropWebpFiles(e.dataTransfer.files)
    }
  }

  return (
    <aside className="panel pack-sidebar">
      <div className="panel-header">
        <div className="panel-title-group">
          <Package size={14} className="icon-crimson" />
          <span className="panel-title">{t.packTitle}</span>
        </div>
        <span className="muted-meta">{items.length} / 30</span>
      </div>

      {/* Editable Pack Name */}
      <div className="control-row">
        <label className="control-label">{t.packNameLabel}</label>
        <input
          type="text"
          maxLength={40}
          value={packName}
          onChange={(e) => onPackNameChange(e.target.value)}
          placeholder="SHROUD Pack"
          className="terminal-input"
        />
      </div>

      {/* Dropzone for valid WhatsApp .webp stickers */}
      <div
        className={`dropzone pack-dropzone ${dragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/webp,.webp"
          className="hidden-input"
          onChange={(e) => {
            if (e.target.files?.length) onDropWebpFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Upload size={16} className="icon-crimson" />
        <span className="dropzone-main">{t.packDropMain}</span>
        <span className="dropzone-sub">{t.packDropSub}</span>
      </div>

      {packError && <p className="error-line">{packError}</p>}

      {/* Sticker Items List */}
      <div className="pack-list">
        {items.length === 0 ? (
          <div className="pack-empty">{t.packEmpty}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="pack-item">
              <img src={item.url} alt={item.name} className="pack-thumb" />
              <div className="pack-item-meta">
                <input
                  type="text"
                  maxLength={32}
                  value={item.name}
                  onChange={(e) => onRenameItem(item.id, e.target.value)}
                  className="pack-item-name-input"
                  aria-label="Sticker name"
                />
                <span className="muted-meta">{(item.sizeBytes / 1024).toFixed(1)} KB</span>
              </div>
              <button
                type="button"
                className="pack-remove-btn"
                onClick={() => onRemoveItem(item.id)}
                title={t.packRemove}
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Bottom Actions: Download .wastickers + Clear List */}
      <div className="pack-actions">
        <button
          type="button"
          className="btn-export pack-dl-btn"
          disabled={items.length === 0}
          onClick={onDownloadPack}
        >
          <div className="export-icons">
            <Smartphone size={14} />
            <span className="os-tag">Android · iOS</span>
          </div>
          <span className="export-label">.wastickers</span>
        </button>

        <button
          type="button"
          className="btn-secondary pack-clear-btn"
          disabled={items.length === 0}
          onClick={onClearPack}
        >
          <Trash2 size={13} />
          {t.packClear}
        </button>
      </div>

      <a
        href={`${import.meta.env.BASE_URL}shroud-extension.zip`}
        download="shroud-extension.zip"
        className="btn-secondary ext-download-btn"
      >
        <Download size={13} />
        {t.downloadExtBtn}
      </a>
    </aside>
  )
}
