import { useEffect, useState } from 'react'
import type { LangCode } from '../i18n/translations'

export interface ZyloBannerItem {
  id: string
  name: string
  slot: 'viewer_left' | 'viewer_right'
  mediaUrl: string
  mediaType?: 'image' | 'video'
  mediaVariants?: Partial<Record<LangCode, string>>
  clickUrl: string
  weight?: number
  languages?: string[]
  active?: boolean
}

const swrrCurrentWeights: Record<string, number> = {}

/**
 * Smooth Weighted Round-Robin banner selector ported directly from Zylo (src/db/store.js).
 */
export function selectWeightedBanner(
  bannersDb: ZyloBannerItem[],
  slot: 'viewer_left' | 'viewer_right',
  lang = 'all'
): ZyloBannerItem | null {
  const normLang = (lang || 'all').toLowerCase().split('-')[0].trim()
  const activeBanners = bannersDb.filter((b) => {
    if (b.slot !== slot || b.active === false) return false
    const langs = Array.isArray(b.languages) && b.languages.length > 0 ? b.languages : ['all']
    if (langs.includes('all')) return true
    return langs.includes(normLang)
  })

  if (activeBanners.length === 0) return null
  if (activeBanners.length === 1) return activeBanners[0]

  const totalWeight = activeBanners.reduce(
    (sum, b) => sum + Math.max(1, parseInt(String(b.weight ?? 1), 10) || 1),
    0
  )

  let bestBanner: ZyloBannerItem | null = null
  let maxWeight = -Infinity

  for (const b of activeBanners) {
    const effectiveWeight = Math.max(1, parseInt(String(b.weight ?? 1), 10) || 1)
    swrrCurrentWeights[b.id] = (swrrCurrentWeights[b.id] || 0) + effectiveWeight
    if (swrrCurrentWeights[b.id] > maxWeight) {
      maxWeight = swrrCurrentWeights[b.id]
      bestBanner = b
    }
  }

  if (bestBanner) {
    swrrCurrentWeights[bestBanner.id] -= totalWeight
    return bestBanner
  }
  return activeBanners[0]
}

function recordBannerStat(bannerId: string, kind: 'impressions' | 'clicks') {
  try {
    const raw = localStorage.getItem('shroud_banner_stats')
    const stats = raw ? JSON.parse(raw) : {}
    if (!stats[bannerId]) stats[bannerId] = { impressions: 0, clicks: 0 }
    stats[bannerId][kind] = (stats[bannerId][kind] || 0) + 1
    localStorage.setItem('shroud_banner_stats', JSON.stringify(stats))
  } catch {
    // ignore
  }
}

export function AdBannerRail({
  slot,
  lang,
}: {
  slot: 'viewer_left' | 'viewer_right'
  lang: LangCode
}) {
  const [banner, setBanner] = useState<ZyloBannerItem | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        let list: ZyloBannerItem[] = []
        const customRaw = localStorage.getItem('shroud_custom_banners')
        if (customRaw) {
          list = JSON.parse(customRaw)
        } else {
          const res = await fetch(`${import.meta.env.BASE_URL}banners.json`)
          if (res.ok) list = await res.json()
        }
        if (cancelled) return
        const chosen = selectWeightedBanner(list, slot, lang)
        setBanner(chosen)
        if (chosen) recordBannerStat(chosen.id, 'impressions')
      } catch {
        // ignore
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slot, lang])

  if (!banner) return null

  const activeMediaUrl = banner.mediaVariants?.[lang] || banner.mediaUrl
  const isVideo =
    banner.mediaType === 'video' || /\.(mp4|webm)($|\?)/i.test(activeMediaUrl)

  return (
    <aside
      className={`ad-banner-vertical ${slot === 'viewer_left' ? 'ad-banner-left' : 'ad-banner-right'}`}
      aria-label={banner.name || 'Sponsored Banner'}
    >
      <div className="ad-banner-inner">
        <a
          href={banner.clickUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ad-banner-link"
          onClick={() => recordBannerStat(banner.id, 'clicks')}
        >
          <span className="ad-badge">AD</span>
          {isVideo ? (
            <video
              src={activeMediaUrl}
              autoPlay
              loop
              muted
              playsInline
              className="ad-banner-media"
            />
          ) : (
            <img
              src={activeMediaUrl}
              alt={banner.name || 'Ad'}
              className="ad-banner-media"
            />
          )}
        </a>
      </div>
    </aside>
  )
}
