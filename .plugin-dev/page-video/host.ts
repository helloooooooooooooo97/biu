import type { Context } from 'cordis'
import { compileSafe, formatReport } from './compose.ts'

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
    route.send(200, { project: result.project, diagnostics: result.project.diagnostics, report: formatReport(result.project) })
  })

  ctx.tools.register({
    name: 'video_script',
    description:
      'Compile an agent-authored page-video <> script. Root is <timeline> with <track> lanes. Motion is atoms (fade/move/scale/rotate/blur/wipe/clip/flash/glitch) composed with + and ;, plus enter/exit aliases. Supports <clip>, <gap>, <transition enter/exit>, follow, <animate>/<keyframes>, text unit+stagger, <mask>, <solid>. No color grading. Returns diagnostics.',
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
