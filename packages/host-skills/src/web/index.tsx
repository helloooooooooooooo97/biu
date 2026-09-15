import type { Context } from 'cordis'
import { PageEditor } from '@biu/core-editor/web'
import type { DatabaseUi, FsContentProps } from '@biu/type-file-system/ui'

export const name = 'host-skills-ui'
export const inject = ['databaseUi']

function SkillsContent(props: FsContentProps) {
  if (props.record.kind !== 'file') {
    return (
      <p className="fsdb-muted" style={{ margin: '12px 0 0', color: 'var(--dsw-label-3)' }}>
        这是目录。在表格里展开，点某一个文件再编辑正文。
      </p>
    )
  }
  return <PageEditor {...props} />
}

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/skills', { Content: SkillsContent }).dispose)
}
