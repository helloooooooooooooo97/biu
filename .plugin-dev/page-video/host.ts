import type { Context } from 'cordis'
import { compileSafe } from './compose.ts'

export const name = 'page-video'
export const inject = ['http', 'tools']

export function apply(ctx: Context) {
  ctx.http.route('POST', '/api/page-video/compile', async (route) => {
    const body = await route.json<{ script?: string }>()
    const script = typeof body.script === 'string' ? body.script : ''
    const result = compileSafe(script)
    if (!result.ok) {
      route.send(400, { error: result.error })
      return
    }
    route.send(200, result.project)
  })

  ctx.tools.register({
    name: 'video_script',
    description:
      'Compile an agent-authored page-video <> script. Effects: <video background wallpaper padding radius shadow description>, <media in dur speed crop>, <zoom rx ry rz>, <text align valign anim description>, <caption>, <arrow>, <blur mode=blur|mosaic>, <box>, <spotlight>, <stamp>, <cursor click>, <pip>, <image>, <speed>, <trim>, and <audio>. The frontend live-composites the result; the timeline is read-only. Use tags instead of prose editing instructions.',
    parameters: {
      type: 'object',
      properties: {
        script: {
          type: 'string',
          description: 'Full <video>…</video> script using the page-video tag grammar.',
        },
      },
      required: ['script'],
    },
    execute: (args) => {
      const script = String(args.script ?? '')
      const result = compileSafe(script)
      if (!result.ok) return { ok: false, error: result.error }
      return { ok: true, project: result.project }
    },
  })
}
