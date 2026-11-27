<div align="center">

# SHROUD // WhatsApp Sticker Forge

**100% client-side animated & static WhatsApp sticker creator (`.webp` & `.wastickers`) with synchronized audio, local AI background removal, and direct WhatsApp Web publishing.**

🌐 **Language / Idioma:** [Español](./README.md) | **English**

[![Live App](https://img.shields.io/badge/Live%20App-SHROUD%20Forge-cc3540?style=for-the-badge)](https://walterdotblend.github.io/shroud-sticker/)
[![Download Extension](https://img.shields.io/badge/Chrome%2FEdge%20Extension-Download%20.zip-8b1922?style=for-the-badge)](https://github.com/walterdotblend/shroud-sticker/releases/latest/download/shroud-extension.zip)

</div>

---

## ✨ How It Works

SHROUD runs **100% locally in your browser** using GPU Canvas, WebCodecs (`AudioEncoder` + `ImageDecoder`), WebAssembly (`FFmpeg.wasm`), and local AI (`WebGPU` / `WASM`):

1. **01 · Source**
   - Drop local **GIF, MP4, WebM, MOV, MKV, or WebP (static & animated)** files.
   - Or paste direct media / **Giphy, Tenor, Imgur, Twitter/X, TikTok, Klipy** links (via the SHROUD extension from your active tab).
2. **02 · Edit**
   - **512×512 Canvas**: Drag, scale, rotate, flip with **Shattered Mirror**, pan infinitely using the **side sawblade jog wheels**, and toggle Transparent vs. Obsidian background.
   - **Unified 10s Timelines (Video + Audio)**:
     - Hard **10.00s** WhatsApp duration cap.
     - Automatically loads video audio (synced to the video trim) or lets you mute / upload custom audio (`.mp3`, `.wav`, `.ogg`, `.m4a`) with `0%–200%` volume control.
     - **LOOP**: Extend videos or audio shorter than 10s up to 10s with magnetic snap markers at each loop boundary.
     - For files longer than 10s, click and drag the selected segment directly across the track.
3. **03 · Forge**
   - Tune **FPS (up to 45 FPS)**, **Quality** (lowering FPS automatically unlocks maximum quality), and **Cursed** crunch.
   - **AI Background Removal (100% Local)**: `RMBG-1.4` (WebGPU) or `MODNet`.
   - **Auto-Compression ≤ 500 KB**: Lowers quality first and only drops FPS as a last resort.
   - **PC & Mobile Export**:
     - **PC (WhatsApp Web)**: With the [SHROUD Extension](https://github.com/walterdotblend/shroud-sticker/releases/latest/download/shroud-extension.zip), send animated stickers **with sound (OGG/Opus)** directly to your **Self-Chat** (with Forward modal) or **Current Chat**.
     - **Mobile (Android / iOS)**: Download `.webp`, build packs of up to 30 stickers in **Sticker Pack** (auto-saved in `IndexedDB`), export `.wastickers`, or transfer via **P2P QR Code**.
