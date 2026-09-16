import type { Context } from 'cordis'
import type { DatabaseUi, FsCellProps, FsContentProps } from '@biu/type-file-system/ui'
import { AttachmentList } from '@biu/public-ui'

export const name = 'host-skills-ui'
export const inject = ['databaseUi']

/** 分享 Skill 时展示何时使用；正文在本表 notes 里。 */
export function SkillsContent({ record }: FsContentProps) {
  return (
    <div style={{ paddingTop: 12 }}>
      <p style={{ margin: 0, color: 'var(--dsw-label-2)', lineHeight: 1.6 }}>
        {String(record.description ?? '')}
      </p>
    </div>
  )
}

function fileHref(recordId: string, path: string) {
  return `/api/skills/file?id=${encodeURIComponent(recordId)}&path=${encodeURIComponent(path)}`
}

/**
 * 技能目录里的文件：每行一个可下载附件。
 * 技能文件没有现成 URL，所以走 /api/skills/file 这个只读端点。
 */
export function SkillFilesCell({ value, record }: FsCellProps) {
  const files = String(value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!files.length) return null
  const id = String(record?.id ?? '')
  return (
    <AttachmentList
      items={files.map((file) => ({
        name: file.split('/').pop() ?? file,
        path: file.includes('/') ? file : undefined,
        href: fileHref(id, file),
      }))}
    />
  )
}

export const skillsChrome = {
  cells: {
    fileList: SkillFilesCell,
  },
}

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/skills', skillsChrome).dispose)
}
