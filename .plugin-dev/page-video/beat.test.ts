import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { test } from 'vitest'
import {
  AD_BEAT_DURATION,
  AD_BEAT_SAMPLE_RATE,
  AD_BEAT_SRC,
  adBeatUrl,
  buildAdBeatWav,
} from './beat.ts'

test('builtin ad beat is an original 16s wav drum bed', async () => {
  const wav = buildAdBeatWav()
  const onDisk = await readFile(resolve(import.meta.dirname, 'assets/ad-beat.wav'))
  assert.equal(AD_BEAT_SRC, 'builtin:ad-beat')
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), 'RIFF')
  assert.equal(String.fromCharCode(...wav.subarray(8, 12)), 'WAVE')
  assert.equal(onDisk.equals(Buffer.from(wav)), true)
  const samples = (wav.length - 44) / 2
  assert.equal(samples, AD_BEAT_SAMPLE_RATE * AD_BEAT_DURATION)
  let peak = 0
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)))
  assert.ok(peak > 20000, `peak ${peak}`)
  const url = adBeatUrl()
  assert.match(url, /^(blob:|data:audio\/wav)/)
})
