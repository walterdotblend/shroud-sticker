/**
 * Liquid Blood-Marble GLSL shader inspired by ArrowBrake's shader pipeline
 * and styled after the gothic obsidian/crimson/ash-rose aesthetic.
 */
export const BLOOD_MARBLE_FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.05;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes.xy) / min(uRes.x, uRes.y);
  float t = uTime * 0.065;

  // Domain-warped liquid oil / marble swirl
  vec2 q = vec2(
    fbm(uv * 1.45 + vec2(0.0, t)),
    fbm(uv * 1.45 + vec2(5.2, -t * 0.8))
  );
  vec2 r = vec2(
    fbm(uv * 1.8 + 2.6 * q + vec2(1.7, 9.2) + 0.15 * t),
    fbm(uv * 1.8 + 2.6 * q + vec2(8.3, 2.8) - 0.12 * t)
  );

  float f = fbm(uv * 1.5 + 2.2 * r);

  // Palette: deep obsidian -> dried blood -> arterial crimson -> pale bone-rose veins
  vec3 obsidian = vec3(0.028, 0.024, 0.032);
  vec3 charcoal = vec3(0.085, 0.070, 0.078);
  vec3 driedBlood = vec3(0.32, 0.045, 0.065);
  vec3 crimson = vec3(0.62, 0.11, 0.14);
  vec3 boneRose = vec3(0.82, 0.60, 0.60);

  vec3 col = mix(obsidian, charcoal, smoothstep(0.15, 0.55, f));

  // Crimson veins
  float vein = smoothstep(0.46, 0.68, f) * (1.0 - smoothstep(0.68, 0.88, f));
  col = mix(col, driedBlood, smoothstep(0.35, 0.72, length(q)) * 0.75);
  col += crimson * vein * 0.85;

  // Sharp specular liquid-metal/ash highlights
  float ridge = pow(clamp(1.0 - abs(f - 0.62) * 9.0, 0.0, 1.0), 2.2);
  col += boneRose * ridge * 0.28;

  // Eerie dark vignette
  vec2 vigUv = gl_FragCoord.xy / uRes.xy;
  float vig = smoothstep(1.15, 0.25, length(vigUv - 0.5) * 1.35);
  col *= mix(0.45, 1.0, vig);

  // Subtle film grain
  float grain = (hash21(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * 0.025;
  col = clamp(col + grain, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);
}
`
