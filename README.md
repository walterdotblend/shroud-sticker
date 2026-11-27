<div align="center">

# SHROUD // Forja de Stickers para WhatsApp

**Creador 100% local en tu navegador de stickers animados y estáticos para WhatsApp (`.webp` y `.wastickers`), con soporte de audio sincronizado, eliminación de fondo con IA y envío directo a WhatsApp Web.**

🌐 **Idioma / Language:** **Español** | [English](./README.en.md)

[![Demo en Vivo](https://img.shields.io/badge/Demo%20en%20Vivo-SHROUD%20Forge-cc3540?style=for-the-badge)](https://walterdotblend.github.io/shroud-sticker/)
[![Descargar Extensión](https://img.shields.io/badge/Extensi%C3%B3n%20Chrome%2FEdge-Descargar%20.zip-8b1922?style=for-the-badge)](https://github.com/walterdotblend/shroud-sticker/releases/latest/download/shroud-extension.zip)

</div>

---

## ✨ Cómo funciona

SHROUD procesa todo **directamente en tu navegador** (sin subir tus videos ni imágenes a servidores externos) usando Canvas GPU, WebCodecs (`AudioEncoder` + `ImageDecoder`), WebAssembly (`FFmpeg.wasm`) e IA local (`WebGPU` / `WASM`):

1. **01 · Fuente (`SOURCE`)**
   - Arrastra o selecciona archivos locales: **GIF, MP4, WebM, MOV, MKV o WebP (estáticos y animados)**.
   - O pega enlaces directos / páginas de **Giphy, Tenor, Imgur, Twitter/X, TikTok, Klipy** (usando la extensión desde la pestaña abierta).
2. **02 · Editar (`EDIT`)**
   - **Canvas 512×512**: Arrastra, escala, rota, activa **Espejo Roto (`Mirror`)**, usa las **sierras circulares infinitas** laterales para mover en X/Y sin límite y elige fondo transparente u obsidiana.
   - **Líneas de tiempo unificadas de 10s (Video + Audio)**:
     - Límite estricto de **10.00s** de WhatsApp.
     - Si el video tiene audio, se carga por defecto y se sincroniza con la línea de video; también puedes **silenciarlo o subir tu propio audio** (`.mp3`, `.wav`, `.ogg`, `.m4a`) con control de volumen (`0%–200%`).
     - **LOOP**: Si el video o el audio dura menos de 10s, activa **LOOP** para extenderlo en bucle hasta 10s con marcas e imán en cada repetición.
     - En archivos largos (>10s), arrastra directamente la zona seleccionada para recorrer todo el archivo.
3. **03 · Forjar (`FORGE`)**
   - Ajusta **FPS (hasta 45 FPS)**, **Calidad** (si bajas los FPS, la calidad sube automáticamente al máximo disponible) y modo **Cursed / Feo**.
   - **Quitar Fondo con IA (100% Local)**: Elige entre `RMBG-1.4` (WebGPU, ideal para anime/objetos) o `MODNet` (rápido para personas).
   - **Compresión automática ≤ 500 KB**: Reduce primero la calidad y solo como último recurso reduce los FPS para cumplir el límite de WhatsApp.
   - **Exportar en PC o Celular**:
     - **PC (WhatsApp Web)**: Con la [Extensión de SHROUD](https://github.com/walterdotblend/shroud-sticker/releases/latest/download/shroud-extension.zip) instalada, envía stickers animados **con sonido (OGG/Opus)** directamente a tu **Chat Propio** (abriendo *Reenviar*) o al **Chat Actual**.
     - **Celular (Android / iOS)**: Descarga `.webp`, arma paquetes de hasta 30 stickers en **Sticker Pack** (guardado automáticamente en `IndexedDB` del navegador) y exporta `.wastickers` o transfiere directo por **Código QR P2P**.

---

## 🧩 Instalar la Extensión de SHROUD (PC · WhatsApp Web con Sonido)

1. Descarga [`shroud-extension.zip`](https://github.com/walterdotblend/shroud-sticker/releases/latest/download/shroud-extension.zip) y descomprime la carpeta.
2. Abre `chrome://extensions` (o `edge://extensions`).
3. Activa el **Modo de desarrollador** (*Developer mode*).
4. Pulsa **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta extraída.
5. Recarga SHROUD y mantén `https://web.whatsapp.com/` abierto en otra pestaña.

---

## 🔒 Privacidad y Seguridad

- **Cero almacenamiento en servidor**: El procesamiento de video, audio, WebP e IA ocurre 100% en tu dispositivo.
- **Relay CORS (`worker/cloudflare-relay.js`)**: Solo actúa como proxy temporal en memoria para enlaces remotos bloqueados por CORS, restringido por `Origin`/`Referer` a la aplicación y sin credenciales ni tokens privados en el repositorio.
