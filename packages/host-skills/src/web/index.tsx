import type { Context } from 'cordis'
import type { DatabaseUi, FsCellProps, FsContentProps, FsViewProps } from '@biu/type-file-system/ui'
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

function SkillLibraryView({ rows, onOpen }: FsViewProps) {
  if (!rows.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--dsw-label-3)' }}>
        还没有 Skill，点击右上角“新建”添加。
      </div>
    )
  }
  return (
    <div
      data-testid="skills-library"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 12,
        padding: 16,
      }}
    >
      {rows.map((row) => {
        const files = String(row.fileList ?? '').split('\n').filter(Boolean).length
        const tags = Array.isArray(row.tags) ? row.tags.map(String).filter(Boolean) : []
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onOpen(row)}
            style={{
              minHeight: 144,
              padding: 16,
              border: '1px solid var(--dsw-border)',
              borderRadius: 12,
              background: 'var(--dsw-bg)',
              color: 'var(--dsw-label)',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {String(row.emoji ?? '') ? `${String(row.emoji)} ` : ''}
                {String(row.title ?? row.id)}
              </strong>
              <span style={{ color: row.enabled ? '#56b870' : 'var(--dsw-label-3)', fontSize: 12 }}>
                {row.enabled ? '已启用' : '已停用'}
              </span>
            </span>
            <span
              style={{
                display: '-webkit-box',
                minHeight: 40,
                marginTop: 10,
                overflow: 'hidden',
                color: 'var(--dsw-label-2)',
                fontSize: 13,
                lineHeight: 1.55,
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 2,
              }}
            >
              {String(row.description ?? '') || '尚未填写使用说明'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, color: 'var(--dsw-label-3)', fontSize: 12 }}>
              <span>{files ? `${files} 个附加文件` : '仅 SKILL.md'}</span>
              {tags.slice(0, 2).map((tag) => (
                <span key={tag} style={{ padding: '2px 6px', borderRadius: 999, background: 'var(--dsw-hover)' }}>
                  {tag}
                </span>
              ))}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => {
    const chrome = ui.decorate('/skills', skillsChrome)
    const view = ui.registerView('/skills', {
      id: 'skill-library',
      label: '仓库',
      plugin: 'skills',
      View: SkillLibraryView,
    })
    return () => {
      chrome.dispose()
      view.dispose()
    }
  })
}
