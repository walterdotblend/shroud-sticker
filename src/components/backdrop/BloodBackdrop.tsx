import { useEffect, useRef, useState } from 'react'
import { BLOOD_MARBLE_FRAG } from './bloodMarbleShader'
import {
  createWebglProgram,
  disposeWebglProgram,
  isSoftwareRenderer,
  releaseWebglContext,
  rendererName,
  WEBGL_CONTEXT_OPTIONS,
} from './webgl'

/**
 * Full-bleed gothic liquid-blood WebGL backdrop adapted from ArrowBrake's CanvasSceneHost.
 * Falls back cleanly to a CSS obsidian-crimson gradient if WebGL is unavailable.
 */
export function BloodBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fallbackCss, setFallbackCss] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      setFallbackCss(true)
      return
    }

    const gl = canvas.getContext('webgl', WEBGL_CONTEXT_OPTIONS)
    if (!gl) {
      setFallbackCss(true)
      return
    }

    if (isSoftwareRenderer(rendererName(gl))) {
      releaseWebglContext(gl)
      setFallbackCss(true)
      return
    }

    const resources = createWebglProgram(gl, BLOOD_MARBLE_FRAG, 'blood-marble')
    if (!resources) {
      releaseWebglContext(gl)
      setFallbackCss(true)
      return
    }

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(resources.prog, 'aPos')
    const uRes = gl.getUniformLocation(resources.prog, 'uRes')
    const uTime = gl.getUniformLocation(resources.prog, 'uTime')

    gl.useProgram(resources.prog)
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.floor(window.innerWidth * dpr * 0.75))
      const h = Math.max(1, Math.floor(window.innerHeight * dpr * 0.75))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
    }

    resize()
    window.addEventListener('resize', resize)

    let rafId = 0
    const start = performance.now()
    let lastDraw = 0

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick)
      if (document.hidden) return
      // Cap at ~30fps to stay light while FFmpeg.wasm encodes
      if (now - lastDraw < 33) return
      lastDraw = now

      const elapsed = (now - start) / 1000
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, elapsed)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      if (buf) gl.deleteBuffer(buf)
      disposeWebglProgram(gl, resources)
      releaseWebglContext(gl)
    }
  }, [])

  return (
    <div className="backdrop-root" aria-hidden="true">
      {!fallbackCss ? (
        <canvas ref={canvasRef} className="backdrop-canvas" />
      ) : (
        <div className="backdrop-css-fallback" />
      )}
      <div className="backdrop-scanlines" />
    </div>
  )
}
