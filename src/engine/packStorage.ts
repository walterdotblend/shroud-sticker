import type { PackStickerItem } from './wastickers'

const DB_NAME = 'shroud_pack_db'
const DB_VERSION = 1
const STORE_NAME = 'pack_state'
const STATE_KEY = 'active_pack'

interface StoredStickerRecord {
  id: string
  name: string
  bytes: ArrayBuffer
  mimeType: string
  sizeBytes: number
}

interface StoredPackState {
  packName: string
  items: StoredStickerRecord[]
  updatedAt: number
}

function openPackDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'))
  })
}

export async function loadSavedPackState(): Promise<{
  packName: string
  items: PackStickerItem[]
} | null> {
  try {
    const db = await openPackDb()
    const state = await new Promise<StoredPackState | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const getReq = store.get(STATE_KEY)
      getReq.onsuccess = () => resolve(getReq.result as StoredPackState | undefined)
      getReq.onerror = () => reject(getReq.error)
    })
    db.close()

    if (!state) return null
    const items: PackStickerItem[] = (state.items || []).map((rec) => {
      const blob = new Blob([rec.bytes], { type: rec.mimeType || 'image/webp' })
      const url = URL.createObjectURL(blob)
      return {
        id: rec.id,
        name: rec.name,
        blob,
        url,
        sizeBytes: rec.sizeBytes || blob.size,
      }
    })

    return {
      packName: state.packName || 'SHROUD Pack',
      items,
    }
  } catch {
    return null
  }
}

export async function savePackState(packName: string, items: PackStickerItem[]): Promise<void> {
  try {
    const records: StoredStickerRecord[] = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        name: item.name,
        bytes: await item.blob.arrayBuffer(),
        mimeType: item.blob.type || 'image/webp',
        sizeBytes: item.sizeBytes || item.blob.size,
      }))
    )

    const payload: StoredPackState = {
      packName: packName || 'SHROUD Pack',
      items: records,
      updatedAt: Date.now(),
    }

    const db = await openPackDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const putReq = store.put(payload, STATE_KEY)
      putReq.onsuccess = () => resolve()
      putReq.onerror = () => reject(putReq.error)
    })
    db.close()
  } catch {
    // ignore storage quota or private-mode errors
  }
}
