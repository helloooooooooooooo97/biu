import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from 'cordis'
import { compileSafe, formatReport } from './compose.ts'

export const name = 'page-video'
export const inject = ['http', 'tools']

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url))
const AUDIO_FILE = /^[A-Za-z0-9._-]+\.(mp3|wav|ogg|m4a)$/i

function audioMime(name: string) {
  if (/\.wav$/i.test(name)) return 'audio/wav'
  if (/\.ogg$/i.test(name)) return 'audio/ogg'
  if (/\.m4a$/i.test(name)) return 'audio/mp4'
  return 'audio/mpeg'
}

function packedAudioPath(name: string) {
  for (const dir of [PLUGIN_DIR, join(PLUGIN_DIR, 'assets')]) {
    const path = join(dir, name)
    if (existsSync(path)) return path
  }
  return ''
}

export function apply(ctx: Context) {
  ctx.http.route('GET', '/api/page-video/assets/:name', async (route) => {
    const name = decodeURIComponent(route.params.name ?? '')
    if (!AUDIO_FILE.test(name)) {
      route.send(400, { error: 'invalid asset' })
      return
    }
    const path = packedAudioPath(name)
    if (!path) {
      route.send(404, { error: 'not found' })
      return
    }
    const bytes = await readFile(path)
    route.res.writeHead(200, {
      'content-type': audioMime(name),
      'cache-control': 'public, max-age=3600',
      'content-length': String(bytes.length),
    })
    route.res.end(bytes)
  })

  ctx.http.route('POST', '/api/page-video/compile', async (route) => {
    const body = await route.json<{ script?: string }>()
    const script = typeof body.script === 'string' ? body.script : ''
    const result = compileSafe(script)
    if (!result.ok) {
      route.send(400, { error: result.error })
      return
    }
    route.send(200, { project: result.project, diagnostics: result.project.diagnostics, report: formatReport(result.project) })
  })

  ctx.tools.register({
    name: 'video_script',
    description:
      'Compile an agent-authored page-video <> script. Root is <timeline> with <track> lanes. Motion is atoms composed with + and ;. Supports <clip>, <gap>, <transition>, follow, <animate>/<keyframes>, <component src>, <AbsoluteFill>. No color grading. Returns diagnostics.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Full <timeline>…</timeline> script. Do not use the old <video> root.',
        },
      },
      required: ['script'],
    },
    execute: (args) => {
      const script = String(args.script ?? '')
      const result = compileSafe(script)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, project: result.project, diagnostics: result.project.diagnostics, report: formatReport(result.project) }
    },
  })
}
