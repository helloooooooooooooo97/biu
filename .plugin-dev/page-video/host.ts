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
      'Compile a page-video <> script into a timeline. Tags: <video fps size>, <title>, <scene>, <caption at>, <media src>, <zoom at cx cy depth />. The page block live-composites on the frontend (video element + camera), not an exported file. Use the tag grammar only.',
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
