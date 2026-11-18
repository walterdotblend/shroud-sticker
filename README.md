# SHROUD // WhatsApp Sticker Forge

Herramienta web 100% client-side (alojable en **GitHub Pages**) para descargar, editar y convertir cualquier GIF o video corto en un **sticker animado para WhatsApp** (`.webp` 512×512, ≤ 500 KB, ≤ 10s).

## Características
- **100% local en tu navegador** usando `FFmpeg.wasm` (sin servidores ni subidas).
- **Herramientas estilo Ezgif**:
  - **Recortar (Crop)** interactivo sobre la vista previa (`1:1`, `Libre`, `16:9`, `4:3`, `9:16`).
  - **Redimensionar a 512×512** (`Contain Transparente`, `Cover`, `Contain Oscuro`, `Stretch`).
  - **Recortar duración (Trim)** con rango inicio/fin.
  - **Acelerar / Velocidad** (`0.25×` a `4×`) y **Reversa**.
  - **Auto-Compresión para WhatsApp (≤ 500 KB)**: ajusta calidad y FPS automáticamente en múltiples pasadas hasta cumplir el límite de WhatsApp.
- **Carga por archivo local o URL directa** (`.gif`, `.mp4`, `.webm`, `.mov`).
- **Estética gótica / terminal oscura** con shader WebGL de mármol líquido carmesí adaptado de la arquitectura de *ArrowBrake (Arroxy)*.

## Desarrollo local
```bash
npm install
npm run dev
```

## Publicar en GitHub Pages
El repositorio incluye `.github/workflows/deploy.yml` y `base: './'` en `vite.config.ts`.
Solo sube el proyecto a GitHub en la rama `main` y activa **Settings → Pages → Source: GitHub Actions**.
