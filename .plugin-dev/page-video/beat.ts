/** Original CC0 drum/beat bed for the 16s default ad. 120 BPM, kicks on the grid, hats, snare, flash stabs on each 2s cut. */

export const AD_BEAT_SRC = 'builtin:ad-beat'
export const AD_BEAT_BPM = 120
export const AD_BEAT_DURATION = 16
export const AD_BEAT_SAMPLE_RATE = 22050

let cachedUrl = ''

export function adBeatUrl() {
  if (cachedUrl) return cachedUrl
  const bytes = buildAdBeatWav()
  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    cachedUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
    return cachedUrl
  }
  cachedUrl = `data:audio/wav;base64,${bytesToBase64(bytes)}`
  return cachedUrl
}

export function buildAdBeatWav() {
  const rate = AD_BEAT_SAMPLE_RATE
  const n = Math.floor(rate * AD_BEAT_DURATION)
  const samples = new Float32Array(n)
  const beat = 60 / AD_BEAT_BPM
  for (let i = 0; i < n; i++) {
    const t = i / rate
    const bar = t / (beat * 4)
    const drive = 0.72 + 0.28 * Math.sin(bar * Math.PI)
    samples[i] =
      kick(t, beat) * 0.92 +
      snare(t, beat) * 0.55 +
      hat(t, beat) * 0.22 +
      bass(t, beat) * 0.34 * drive +
      stab(t) * 0.42
  }
  peakNormalize(samples, 0.92)
  return encodeWav(samples, rate)
}

function kick(t: number, beat: number) {
  const phase = t % beat
  const hit = Math.exp(-phase * 18)
  const click = Math.exp(-phase * 90) * Math.sin(2 * Math.PI * 1800 * phase)
  const body = Math.sin(2 * Math.PI * (58 + 90 * Math.exp(-phase * 22)) * phase)
  return (body * hit + click * 0.18) * (phase < beat * 0.98 ? 1 : 0)
}

function snare(t: number, beat: number) {
  const step = t % (beat * 2)
  const onset = beat
  if (step < onset || step > onset + 0.18) return 0
  const p = step - onset
  const noise = hash(Math.floor(t * 22050)) * 2 - 1
  return (noise * Math.exp(-p * 22) + Math.sin(2 * Math.PI * 190 * p) * Math.exp(-p * 14) * 0.35)
}

function hat(t: number, beat: number) {
  const step = beat / 2
  const phase = t % step
  const even = Math.floor(t / step) % 2 === 0
  const noise = hash(Math.floor(t * 44100) ^ 0x9e3779b9) * 2 - 1
  const env = Math.exp(-phase * (even ? 38 : 70))
  return noise * env * (even ? 1 : 0.55)
}

function bass(t: number, beat: number) {
  const note = t % (beat * 4) < beat * 2 ? 55 : 41.25
  const env = 0.35 + 0.65 * (1 - (t % beat) / beat)
  return Math.sin(2 * Math.PI * note * t) * env + Math.sin(2 * Math.PI * note * 2 * t) * env * 0.12
}

function stab(t: number) {
  const cut = t % 2
  if (cut > 0.11) return 0
  const noise = hash(Math.floor(t * 18000) ^ 0x85ebca6b) * 2 - 1
  const tone = Math.sin(2 * Math.PI * 920 * cut) + Math.sin(2 * Math.PI * 1380 * cut) * 0.4
  return (tone * 0.55 + noise * 0.45) * Math.exp(-cut * 38)
}

function peakNormalize(samples: Float32Array, peak: number) {
  let max = 1e-6
  for (const s of samples) max = Math.max(max, Math.abs(s))
  const g = peak / max
  for (let i = 0; i < samples.length; i++) samples[i] *= g
}

function encodeWav(samples: Float32Array, rate: number) {
  const dataSize = samples.length * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buf)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let o = 44
  for (const s of samples) {
    const v = Math.max(-1, Math.min(1, s))
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
    o += 2
  }
  return new Uint8Array(buf)
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

function hash(n: number) {
  let x = (n + 0x9e3779b9) >>> 0
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  return (x >>> 0) / 0xffffffff
}

function bytesToBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  if (typeof btoa === 'function') return btoa(s)
  return Buffer.from(bytes).toString('base64')
}
