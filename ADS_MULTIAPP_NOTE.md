# Nota de Integración: Sistema Centralizado de Anuncios (Zylo + Sticker Forge + Cross-Diary)

- `src/components/AdBannerRail.tsx` consulta primero el servidor central de anuncios de **Zylo** (`https://zylo.stream/api/banners/shroud_left` y `https://zylo.stream/api/banners/shroud_right`) y usa `public/banners.json` como respaldo local.
- Los anuncios de esta app se administran desde el panel Admin de Zylo bajo las ubicaciones **`shroud_left`** y **`shroud_right`**.
